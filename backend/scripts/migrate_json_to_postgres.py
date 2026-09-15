"""Copy the JSON-file store into Postgres.

    python scripts/migrate_json_to_postgres.py           # dry run, prints a plan
    python scripts/migrate_json_to_postgres.py --apply   # actually write

Idempotent: records already present (same collection + id) are skipped, so
re-running after a partial failure is safe. Reads DATABASE_URL and DATA_DIR
from backend/.env via the app's own settings, so it can't drift from the app.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.storage.postgres_store import PostgresStore  # noqa: E402

COLLECTIONS = ("users", "cards", "statements", "otps")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write, instead of dry run")
    args = ap.parse_args()

    if not settings.database_url:
        print("DATABASE_URL is not set in backend/.env")
        return 1

    store = PostgresStore(settings.database_url)
    total_new = total_skip = 0

    for collection in COLLECTIONS:
        path = Path(settings.data_dir) / f"{collection}.json"
        if not path.exists():
            print(f"{collection:12} -- no file, skipping")
            continue

        records = json.loads(path.read_text(encoding="utf-8") or "[]")
        new = skipped = 0
        for record in records:
            rid = record.get("id")
            if not rid:
                print(f"  ! {collection}: record without an id, skipped")
                continue
            if store.get(collection, rid) is not None:
                skipped += 1
                continue
            if args.apply:
                store.add(collection, record)
            new += 1

        total_new += new
        total_skip += skipped
        print(f"{collection:12} {len(records):3} in file -> {new:3} new, {skipped:3} already there")

    verb = "migrated" if args.apply else "would migrate"
    print(f"\n{verb} {total_new} record(s); {total_skip} already present")
    if not args.apply:
        print("dry run -- re-run with --apply to write")
    store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
