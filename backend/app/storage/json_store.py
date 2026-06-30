"""File-based storage: one JSON file per collection, list of records.

Each record carries a "user" field (the owner's email) so a single file holds
all users' data, filtered on read. Writes are lock-guarded and atomic (write
to temp then rename) to avoid corruption.
"""
import json
import threading
from pathlib import Path
from typing import Optional

from .base import StorageInterface


class JsonStore(StorageInterface):
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _file(self, collection: str) -> Path:
        return self.data_dir / f"{collection}.json"

    def _read(self, collection: str) -> list[dict]:
        f = self._file(collection)
        if not f.exists():
            return []
        with f.open(encoding="utf-8") as fh:
            return json.load(fh)

    def _write(self, collection: str, records: list[dict]) -> None:
        f = self._file(collection)
        tmp = f.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(records, fh, indent=2, default=str)
        tmp.replace(f)

    def list(self, collection: str, user: Optional[str] = None) -> list[dict]:
        recs = self._read(collection)
        if user is not None:
            recs = [r for r in recs if r.get("user") == user]
        return recs

    def get(self, collection: str, id: str, user: Optional[str] = None) -> Optional[dict]:
        for r in self._read(collection):
            if r.get("id") == id and (user is None or r.get("user") == user):
                return r
        return None

    def add(self, collection: str, record: dict) -> dict:
        with self._lock:
            recs = self._read(collection)
            recs.append(record)
            self._write(collection, recs)
        return record

    def update(self, collection: str, id: str, patch: dict, user: Optional[str] = None) -> Optional[dict]:
        with self._lock:
            recs = self._read(collection)
            updated = None
            for r in recs:
                if r.get("id") == id and (user is None or r.get("user") == user):
                    r.update(patch)
                    updated = r
                    break
            if updated is not None:
                self._write(collection, recs)
        return updated

    def delete(self, collection: str, id: str, user: Optional[str] = None) -> bool:
        with self._lock:
            recs = self._read(collection)
            kept = [r for r in recs if not (r.get("id") == id and (user is None or r.get("user") == user))]
            changed = len(kept) != len(recs)
            if changed:
                self._write(collection, kept)
        return changed
