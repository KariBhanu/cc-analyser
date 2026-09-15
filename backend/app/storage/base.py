"""Storage interface.

The whole app talks to this interface, never to files directly. v1 ships a
JSON-file implementation; swapping to Postgres later means writing one new
class that implements these methods -- no router/service changes.
"""
from abc import ABC, abstractmethod
from typing import Any, Optional


class StorageInterface(ABC):
    @abstractmethod
    def list(self, collection: str, user: Optional[str] = None) -> list[dict]: ...

    @abstractmethod
    def get(self, collection: str, id: str, user: Optional[str] = None) -> Optional[dict]: ...

    @abstractmethod
    def add(self, collection: str, record: dict) -> dict: ...

    @abstractmethod
    def update(self, collection: str, id: str, patch: dict, user: Optional[str] = None) -> Optional[dict]: ...

    @abstractmethod
    def delete(self, collection: str, id: str, user: Optional[str] = None) -> bool: ...
