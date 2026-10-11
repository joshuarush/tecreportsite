# Automated TEC Data Refresh

The Texas Ethics Commission publishes a full campaign-finance CSV export
(`TEC_CF_CSV.zip`, ~1 GB, refreshed most mornings). This repo's pipeline
turns that into the four parquet files the site queries, then publishes
them plus a `manifest.json` to the CDN bucket.

## Pipeline

```
scripts/refresh/tec_refresh.py
  1. HEAD the TEC zip; skip the run if unchanged since last success
  2. Download + extract
  3. Rebuild parquet files (scripts/build_parquet.sql via DuckDB)
  4. Sort contributions/expenditures by (filer_id, date) in a separate
     low-memory pass (TEC_DUCKDB_SORT_MEMORY, default 600MB) so profile
     queries in the browser skip unrelated row groups
  5. Validate: no table shrinks >2%, data_through never regresses
  6. Copy into data/ and upload to R2 (rclone)
  7. Publish manifest.json LAST (readers never see a manifest that
     references parquet files that haven't landed)
```

Run it manually:

```bash
python3 scripts/refresh/tec_refresh.py --base-dir . --work-dir tmp/tec_refresh --skip-upload
```

Dependencies: `python3` (stdlib only), `curl`, `duckdb` CLI, `rclone`
(upload only). R2 credentials come from env vars or a `.env` file — see
`scripts/refresh/.env.example`. Validation failures exit non-zero;
`--force` overrides both the skip-if-unchanged check and validation.

### Self-healing

The pipeline is meant to run without anyone touching it:

- A failed run doesn't update `state.json`, so the next scheduled run
  retries even if TEC hasn't republished.
- A lock left behind by a killed run (reboot, OOM) is cleared after 3 hours.
- A shrink that fails validation is accepted automatically once the same
  shrink shows up in 3 distinct TEC dumps, so a real TEC restatement doesn't
  block refreshes forever. `--force` still overrides immediately.

## manifest.json

Published next to the parquet files. The frontend fetches it with
`cache: 'no-store'` on every load.

```jsonc
{
  "schema": 1,
  "version": "eb73a6a96460",      // short hash over all file sha256s
  "built_at": "2026-07-03T14:27:50Z",
  "data_through": 20260703,        // max received_date across tables
  "files": [ { "name", "size", "sha256", "rows" }, ... ],
  "stats": { "filers", "reports", "contributions", "expenditures" }
}
```

How the frontend uses it:

- **Cache invalidation** — IndexedDB entries are tagged with the file's
  `sha256`. A refresh invalidates exactly the files that changed; code
  deploys never force a re-download. (Historically this required a
  manual `DB_VERSION` bump that nuked all ~290 MB for every user.)
- **Freshness display** — footer "Records from 2020 through …" line,
  homepage stats and Data Coverage panel, loader download size. If
  `built_at` is more than 4 days old the footer shows "refresh overdue".
- **Fallback** — if the manifest fetch fails, the frontend falls back to
  a built-in file list and accepts whatever is cached (offline keeps
  working).

## Scheduling

Production runs on a schedule (twice daily) from a NAS with plenty of
disk; any always-on box works. Wrap with `scripts/refresh/run_refresh.sh`
style logging and let the skip-if-unchanged check make extra runs free.
Around filing deadlines (Jan 15, Jul 15, 30-day, 8-day) TEC republishes
more often — the pipeline picks up whatever is there on each run.
