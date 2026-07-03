#!/usr/bin/env python3
"""
Armadollar data refresh pipeline.

Downloads the full TEC campaign-finance CSV dump, rebuilds the parquet
files with DuckDB, validates them against the previous run, uploads to
Cloudflare R2, and publishes a manifest.json that the frontend uses for
cache invalidation and freshness display.

Designed to run unattended on both macOS and the QNAP NAS. Dependencies:
python3 (stdlib only), curl, a duckdb CLI binary, and rclone. R2
credentials come from the environment (see .env.example in this dir).

Usage:
  python3 tec_refresh.py                 # full run
  python3 tec_refresh.py --skip-upload   # build + validate only
  python3 tec_refresh.py --force         # run even if source unchanged,
                                         # and bypass shrink validation
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

TEC_URL = "https://prd.tecprd.ethicsefile.com/public/cf/public/TEC_CF_CSV.zip"

SCRIPT_DIR = Path(__file__).resolve().parent
# Repo layout keeps build_parquet.sql one level up (scripts/); the NAS
# deployment keeps it right next to this script.
BUILD_SQL = next(
    (p for p in (SCRIPT_DIR / "build_parquet.sql", SCRIPT_DIR.parent / "build_parquet.sql") if p.exists()),
    SCRIPT_DIR.parent / "build_parquet.sql",
)

# Table name -> (parquet file, date column used for "data through")
TABLES = {
    "filers": ("filers.parquet", None),
    "reports": ("reports.parquet", "received_date"),
    "contributions": ("contributions_2020.parquet", "received_date"),
    "expenditures": ("expenditures.parquet", "received_date"),
}

# A refresh that shrinks any table below this fraction of the previous
# run is treated as a bad source dump and rejected (unless --force).
MIN_ROW_RATIO = 0.98

REQUIRED_CSVS = ["filers.csv", "cover.csv"]  # globs checked separately


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')}] {msg}", flush=True)


def fail(msg: str) -> "NoReturn":  # noqa: F821
    log(f"ERROR: {msg}")
    sys.exit(1)


def load_dotenv(base: Path) -> None:
    """Load KEY=VALUE pairs from base/.env without overriding real env."""
    env_file = base / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def run(cmd: list, **kwargs) -> subprocess.CompletedProcess:
    log("$ " + " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, check=True, **kwargs)


def which_or_fail(*names: str) -> str:
    """Return the first binary found among names, searching PATH and TEC_BIN_DIR."""
    extra = os.environ.get("TEC_BIN_DIR")
    for name in names:
        found = shutil.which(name)
        if found:
            return found
        if extra and (Path(extra) / name).exists():
            return str(Path(extra) / name)
    fail(f"required binary not found: {' or '.join(names)} (set TEC_BIN_DIR?)")


def head_source() -> dict:
    """HEAD the TEC zip (following redirects) for freshness metadata."""
    out = subprocess.run(
        ["curl", "-sIL", "--max-time", "60", TEC_URL],
        check=True, capture_output=True, text=True,
    ).stdout
    meta = {}
    for line in out.splitlines():
        lower = line.lower()
        if lower.startswith("last-modified:"):
            meta["last_modified"] = line.split(":", 1)[1].strip()
        elif lower.startswith("content-length:"):
            meta["size"] = int(line.split(":", 1)[1].strip())
    if "size" not in meta or meta["size"] < 100_000_000:
        fail(f"source HEAD looks wrong (got {meta.get('size')} bytes) — TEC may be down")
    return meta


def download_zip(dest: Path) -> None:
    part = dest.with_suffix(".zip.part")
    run([
        "curl", "-fL", "--retry", "5", "--retry-delay", "15",
        "-C", "-", "-o", str(part), TEC_URL,
    ])
    part.rename(dest)


def extract_zip(zip_path: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest)
    names = {p.name for p in dest.iterdir()}
    for required in REQUIRED_CSVS:
        if required not in names:
            fail(f"expected {required} in TEC dump, found: {sorted(names)[:10]}...")
    if not list(dest.glob("contribs_*.csv")) or not list(dest.glob("expend_*.csv")):
        fail("TEC dump is missing contribs_*.csv or expend_*.csv files")


def build_parquet(duckdb_bin: str, stage: Path, extract: Path) -> Path:
    """Run build_parquet.sql in a staging dir; returns the dir with new parquets."""
    if stage.exists():
        shutil.rmtree(stage)
    (stage / "data").mkdir(parents=True)
    csv_link = stage / "csv_source"
    csv_link.symlink_to(extract, target_is_directory=True)

    memory = os.environ.get("TEC_DUCKDB_MEMORY", "4GB")
    threads = os.environ.get("TEC_DUCKDB_THREADS", "4")
    script = stage / "build.duck"
    script.write_text(
        f"SET memory_limit='{memory}';\n"
        f"SET threads={threads};\n"
        "SET preserve_insertion_order=false;\n"
        f"SET temp_directory='{stage / 'duckdb_tmp'}';\n"
        f".read {BUILD_SQL}\n"
    )
    log(f"$ {duckdb_bin} < {script}  (cwd={stage})")
    with script.open() as fh:
        subprocess.run([duckdb_bin], stdin=fh, check=True, cwd=stage)
    return stage / "data"


def table_stats(duckdb_bin: str, data_dir: Path) -> dict:
    stats = {}
    for table, (fname, date_col) in TABLES.items():
        path = data_dir / fname
        if not path.exists():
            fail(f"build produced no {fname}")
        select = f"SELECT COUNT(*) AS rows"
        if date_col:
            select += f", MAX({date_col}) AS max_date"
        select += f" FROM read_parquet('{path}')"
        out = subprocess.run(
            [duckdb_bin, "-json", "-c", select],
            check=True, capture_output=True, text=True,
        ).stdout
        row = json.loads(out)[0]
        stats[table] = {
            "file": fname,
            "rows": int(row["rows"]),
            "max_date": int(row["max_date"]) if row.get("max_date") else None,
            "size": path.stat().st_size,
        }
    return stats


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def validate(stats: dict, previous: dict, force: bool) -> None:
    problems = []
    for table, s in stats.items():
        if s["rows"] == 0:
            problems.append(f"{table} has 0 rows")
        prev = previous.get("tables", {}).get(table)
        if prev and prev.get("rows"):
            ratio = s["rows"] / prev["rows"]
            if ratio < MIN_ROW_RATIO:
                problems.append(
                    f"{table} shrank {prev['rows']:,} -> {s['rows']:,} ({ratio:.1%})"
                )
        if prev and s.get("max_date") and prev.get("max_date"):
            if s["max_date"] < prev["max_date"]:
                problems.append(
                    f"{table} data_through regressed {prev['max_date']} -> {s['max_date']}"
                )
    if problems:
        msg = "; ".join(problems)
        if force:
            log(f"WARNING (--force, continuing anyway): {msg}")
        else:
            fail(f"validation failed: {msg}. Re-run with --force to override.")


def build_manifest(stats: dict, source_meta: dict) -> dict:
    data_through = max(s["max_date"] for s in stats.values() if s["max_date"])
    combined = hashlib.sha256(
        "".join(s["sha256"] for s in stats.values()).encode()
    ).hexdigest()[:12]
    return {
        "schema": 1,
        "version": combined,
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_through": data_through,
        "source": {"url": TEC_URL, **source_meta},
        "files": [
            {
                "name": s["file"],
                "size": s["size"],
                "sha256": s["sha256"],
                "rows": s["rows"],
            }
            for s in stats.values()
        ],
        "stats": {
            "filers": stats["filers"]["rows"],
            "reports": stats["reports"]["rows"],
            "contributions": stats["contributions"]["rows"],
            "expenditures": stats["expenditures"]["rows"],
        },
        "tables": stats,
    }


def upload(rclone_bin: str, data_dir: Path, manifest_path: Path) -> None:
    remote = os.environ.get("TEC_R2_REMOTE", "r2tec:tec-data")
    flags = ["--s3-no-check-bucket", "--retries", "3"]
    for table, (fname, _) in TABLES.items():
        run([rclone_bin, "copyto", str(data_dir / fname), f"{remote}/{fname}", *flags])
    # Manifest goes last so readers never see a manifest describing
    # parquet files that haven't landed yet.
    run([rclone_bin, "copyto", str(manifest_path), f"{remote}/manifest.json", *flags])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-dir", default=os.environ.get("TEC_BASE_DIR", str(SCRIPT_DIR)))
    parser.add_argument("--work-dir", default=os.environ.get("TEC_WORK_DIR"))
    parser.add_argument("--skip-upload", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--keep-work", action="store_true", help="keep zip/extract dirs")
    args = parser.parse_args()

    base = Path(args.base_dir).resolve()
    work = Path(args.work_dir).resolve() if args.work_dir else base / "work"
    work.mkdir(parents=True, exist_ok=True)
    load_dotenv(base)

    lock = work / "refresh.lock"
    try:
        lock.mkdir()
    except FileExistsError:
        fail(f"another refresh appears to be running (rm -r {lock} if stale)")

    status = {"started_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    try:
        duckdb_bin = which_or_fail("duckdb")
        rclone_bin = None if args.skip_upload else which_or_fail("rclone")
        if not BUILD_SQL.exists():
            fail(f"missing {BUILD_SQL}")

        state_path = work / "state.json"
        state = json.loads(state_path.read_text()) if state_path.exists() else {}

        source_meta = head_source()
        log(f"source: {source_meta['size']:,} bytes, modified {source_meta.get('last_modified')}")
        unchanged = (
            state.get("source", {}).get("last_modified") == source_meta.get("last_modified")
            and state.get("source", {}).get("size") == source_meta.get("size")
        )
        if unchanged and not args.force:
            log("source unchanged since last successful run — nothing to do")
            return

        zip_path = work / "TEC_CF_CSV.zip"
        if zip_path.exists() and zip_path.stat().st_size == source_meta["size"] and unchanged:
            log("re-using already-downloaded zip")
        else:
            zip_path.unlink(missing_ok=True)
            download_zip(zip_path)
        log(f"downloaded {zip_path.stat().st_size:,} bytes")

        extract_dir = work / "extract"
        log("extracting...")
        extract_zip(zip_path, extract_dir)

        log("building parquet files (this takes a few minutes)...")
        new_data = build_parquet(duckdb_bin, work / "stage", extract_dir)

        stats = table_stats(duckdb_bin, new_data)
        for table, s in stats.items():
            log(f"  {table}: {s['rows']:,} rows, through {s['max_date']}, {s['size']:,} bytes")

        previous = state.get("manifest", {})
        validate(stats, previous, args.force)

        log("hashing...")
        for s in stats.values():
            s["sha256"] = sha256(new_data / s["file"])

        manifest = build_manifest(stats, source_meta)
        manifest_path = new_data / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))
        log(f"manifest version {manifest['version']}, data through {manifest['data_through']}")

        # Promote new parquets into base/data (kept for local dev + as last-good copy)
        final_data = base / "data"
        final_data.mkdir(exist_ok=True)
        for s in stats.values():
            shutil.copy2(new_data / s["file"], final_data / s["file"])
        shutil.copy2(manifest_path, final_data / "manifest.json")

        if args.skip_upload:
            log("skipping upload (--skip-upload)")
        else:
            upload(rclone_bin, final_data, final_data / "manifest.json")
            log("uploaded 4 parquet files + manifest to R2")

        state = {"source": source_meta, "manifest": manifest,
                 "completed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        state_path.write_text(json.dumps(state, indent=2))
        status.update(ok=True, version=manifest["version"], data_through=manifest["data_through"])
        log("refresh complete")

        if not args.keep_work:
            shutil.rmtree(work / "extract", ignore_errors=True)
            shutil.rmtree(work / "stage", ignore_errors=True)
            zip_path.unlink(missing_ok=True)
    except SystemExit:
        status.update(ok=False)
        raise
    except Exception as exc:  # noqa: BLE001
        status.update(ok=False, error=str(exc))
        log(f"ERROR: {exc}")
        raise
    finally:
        status["finished_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        (work / "last_run.json").write_text(json.dumps(status, indent=2))
        shutil.rmtree(lock, ignore_errors=True)


if __name__ == "__main__":
    main()
