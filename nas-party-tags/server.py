#!/usr/bin/env python3
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

VALID_PARTIES = {"REPUBLICAN", "DEMOCRAT", "LIBERTARIAN", "GREEN", "INDEPENDENT"}
FILER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("PARTY_TAGS_DB", BASE_DIR / "party_tags.sqlite3"))
SEED_PATH = Path(os.environ.get("PARTY_TAGS_SEED", BASE_DIR / "party_tags_seed.json"))
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        "PARTY_TAGS_ALLOWED_ORIGINS",
        "https://tec.joshuaru.sh,http://localhost:4321,http://127.0.0.1:4321",
    ).split(",")
    if origin.strip()
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS party_tags (
                filer_id TEXT PRIMARY KEY,
                party TEXT NOT NULL,
                name TEXT,
                source TEXT NOT NULL DEFAULT 'community',
                tagged_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_party_tags_party ON party_tags(party)")


def seed_db() -> None:
    if not SEED_PATH.exists():
        return

    payload = json.loads(SEED_PATH.read_text())
    rows = payload.get("tags", payload if isinstance(payload, list) else [])
    with db() as conn:
        for row in rows:
            filer_id = str(row.get("filer_id", "")).strip()
            party = str(row.get("party", "")).strip().upper()
            if not filer_id or party not in VALID_PARTIES:
                continue
            conn.execute(
                """
                INSERT OR IGNORE INTO party_tags (filer_id, party, name, source, tagged_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    filer_id,
                    party,
                    row.get("name"),
                    row.get("source") or "seed",
                    row.get("tagged_at") or now_iso(),
                ),
            )


def row_to_tag(row: sqlite3.Row) -> dict:
    return {
        "filer_id": row["filer_id"],
        "party": row["party"],
        "name": row["name"],
        "source": row["source"],
        "tagged_at": row["tagged_at"],
    }


class PartyTagsHandler(BaseHTTPRequestHandler):
    server_version = "TecPartyTags/1.0"

    def end_headers(self) -> None:
        origin = self.headers.get("Origin")
        if "*" in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", "*")
        elif origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Accept")
        self.send_header("Access-Control-Max-Age", "86400")
        super().end_headers()

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"

        if path == "/health":
            self.send_json(200, {"ok": True})
            return

        if path == "/party-tags":
            with db() as conn:
                rows = conn.execute(
                    """
                    SELECT filer_id, party, name, source, tagged_at
                    FROM party_tags
                    ORDER BY party, COALESCE(name, ''), filer_id
                    """
                ).fetchall()
            tags = [row_to_tag(row) for row in rows]
            last_updated = max((tag["tagged_at"] for tag in tags), default=None)
            self.send_json(200, {"tags": tags, "count": len(tags), "lastUpdated": last_updated})
            return

        if path.startswith("/party-tags/"):
            filer_id = unquote(path.split("/", 2)[2]).strip()
            with db() as conn:
                row = conn.execute(
                    """
                    SELECT filer_id, party, name, source, tagged_at
                    FROM party_tags
                    WHERE filer_id = ?
                    """,
                    (filer_id,),
                ).fetchone()
            if not row:
                self.send_json(404, {"error": "No party tag found for this filer"})
                return
            self.send_json(200, {"tag": row_to_tag(row)})
            return

        self.send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path.rstrip("/")
        if path != "/party-tags":
            self.send_json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid JSON body"})
            return

        filer_id = str(payload.get("filer_id", "")).strip()
        party = str(payload.get("party", "")).strip().upper()
        name = payload.get("name")
        name = name.strip() if isinstance(name, str) and name.strip() else None

        if not FILER_ID_RE.match(filer_id):
            self.send_json(400, {"error": "Invalid filer ID"})
            return
        if party not in VALID_PARTIES:
            self.send_json(400, {"error": "Invalid party"})
            return

        tag = {
            "filer_id": filer_id,
            "party": party,
            "name": name,
            "source": "community",
            "tagged_at": now_iso(),
        }

        try:
            with db() as conn:
                conn.execute(
                    """
                    INSERT INTO party_tags (filer_id, party, name, source, tagged_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (tag["filer_id"], tag["party"], tag["name"], tag["source"], tag["tagged_at"]),
                )
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "This filer has already been tagged"})
            return

        self.send_json(201, {"tag": tag})

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.log_date_time_string()} {self.address_string()} {format % args}", flush=True)


def main() -> None:
    init_db()
    seed_db()
    port = int(os.environ.get("PARTY_TAGS_PORT", "8005"))
    host = os.environ.get("PARTY_TAGS_HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), PartyTagsHandler)
    print(f"Party tag API listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
