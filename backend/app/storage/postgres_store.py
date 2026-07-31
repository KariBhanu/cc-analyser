"""Postgres storage: one table, one JSONB column per record.

A drop-in for JsonStore -- same five methods, same semantics. Records keep the
shape they already have; `collection`, `id` and `user` are lifted into real
columns so they can be indexed, and the whole record also lives in `data`.

Why JSONB rather than a table per collection: the app's records are
schemaless dicts that differ per collection (cards, statements, users, otps),
and the StorageInterface is deliberately generic. JSONB keeps the port to a
single class while staying queryable -- `data->>'total_spend'` works, so the
spend-analytics roadmap doesn't need another migration.

`seq` preserves insertion order, which JsonStore gave for free by appending to
a list. Callers rely on it (the Upload page defaults to the first card).
"""
import json
from typing import Optional

from psycopg.types.json import Jsonb
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .base import StorageInterface

SCHEMA = """
CREATE TABLE IF NOT EXISTS records (
    seq        BIGSERIAL,
    collection TEXT NOT NULL,
    id         TEXT NOT NULL,
    "user"     TEXT,
    data       JSONB NOT NULL,
    PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS records_collection_user_idx ON records (collection, "user");
CREATE INDEX IF NOT EXISTS records_seq_idx ON records (seq);
"""


def _dumps(obj) -> str:
    # Mirrors JsonStore's json.dump(default=str) so datetimes survive the trip.
    return json.dumps(obj, default=str)


class PostgresStore(StorageInterface):
    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 5):
        # A local pool matters even against Neon's pooler: a cold TCP+TLS
        # connect to the region is ~350ms, which would otherwise be paid per
        # request.
        self.pool = ConnectionPool(
            dsn,
            min_size=min_size,
            max_size=max_size,
            open=True,
            kwargs={"row_factory": dict_row},
        )
        with self.pool.connection() as conn:
            conn.execute(SCHEMA)

    def close(self) -> None:
        self.pool.close()

    def list(self, collection: str, user: Optional[str] = None) -> list[dict]:
        sql = "SELECT data FROM records WHERE collection = %s"
        args: list = [collection]
        if user is not None:
            sql += ' AND "user" = %s'
            args.append(user)
        sql += " ORDER BY seq"
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(sql, args)
            return [r["data"] for r in cur.fetchall()]

    def get(self, collection: str, id: str, user: Optional[str] = None) -> Optional[dict]:
        sql = "SELECT data FROM records WHERE collection = %s AND id = %s"
        args: list = [collection, id]
        if user is not None:
            sql += ' AND "user" = %s'
            args.append(user)
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(sql, args)
            row = cur.fetchone()
            return row["data"] if row else None

    def add(self, collection: str, record: dict) -> dict:
        rid = record.get("id")
        if not rid:
            # JsonStore would happily append an id-less record that get()
            # could never find again. Fail loudly instead of storing garbage.
            raise ValueError(f"record for collection {collection!r} has no 'id'")
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                'INSERT INTO records (collection, id, "user", data) VALUES (%s, %s, %s, %s)',
                (collection, rid, record.get("user"), Jsonb(record, dumps=_dumps)),
            )
        return record

    def update(
        self, collection: str, id: str, patch: dict, user: Optional[str] = None
    ) -> Optional[dict]:
        sql = "SELECT data FROM records WHERE collection = %s AND id = %s"
        args: list = [collection, id]
        if user is not None:
            sql += ' AND "user" = %s'
            args.append(user)
        # Row-locked read-modify-write, so concurrent patches can't clobber each
        # other -- JsonStore used a process-wide mutex for the same reason, which
        # no longer helps once there is more than one worker.
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(sql + " FOR UPDATE", args)
            row = cur.fetchone()
            if row is None:
                return None
            merged = {**row["data"], **patch}
            cur.execute(
                'UPDATE records SET data = %s, "user" = %s WHERE collection = %s AND id = %s',
                (Jsonb(merged, dumps=_dumps), merged.get("user"), collection, id),
            )
            return merged

    def delete(self, collection: str, id: str, user: Optional[str] = None) -> bool:
        sql = "DELETE FROM records WHERE collection = %s AND id = %s"
        args: list = [collection, id]
        if user is not None:
            sql += ' AND "user" = %s'
            args.append(user)
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(sql, args)
            return cur.rowcount > 0
