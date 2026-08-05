import asyncio
import os
import tempfile
import unittest

# The developer .env can select a real database. Router tests must always import
# the dependency singleton against disposable JSON storage instead.
_IMPORT_DATA = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = ""
os.environ["DATA_DIR"] = _IMPORT_DATA.name

from fastapi import HTTPException  # noqa: E402

from app.models import StatementUpdate  # noqa: E402
from app.routers import statements as statement_router  # noqa: E402
from app.storage.json_store import JsonStore  # noqa: E402


class StatementUpdateTests(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.TemporaryDirectory()
        self.previous_store = statement_router.store
        statement_router.store = JsonStore(self.data.name)
        statement_router.store.add("cards", {
            "id": "card-1",
            "user": "owner@example.com",
            "issuer": "Test Bank",
            "name": "Test Card",
            "base_points_per_100": 2,
            "rupee_per_point": 0.5,
        })
        statement_router.store.add("statements", {
            "id": "statement-1",
            "user": "owner@example.com",
            "card_id": "card-1",
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "total_spend": 500.0,
            "points_earned": 10.0,
            "reward_value": 5.0,
            "note": None,
            "transaction_count": 1,
            "created_at": "2026-02-01T00:00:00+00:00",
        })
        statement_router.store.add("transactions", {
            "id": "transaction-1",
            "user": "owner@example.com",
            "statement_id": "statement-1",
            "card_id": "card-1",
            "date": "2026-01-15",
            "description": "TEST MERCHANT",
            "merchant": "Test Merchant",
            "amount": 500.0,
            "credit": False,
        })

    def tearDown(self):
        statement_router.store = self.previous_store
        self.data.cleanup()

    def test_update_recalculates_rewards_and_preserves_transactions(self):
        updated = asyncio.run(statement_router.update_statement(
            "statement-1",
            StatementUpdate(
                period_start="2026-01-02",
                period_end="2026-02-01",
                total_spend=1000.0,
                points_earned=None,
                note="Corrected statement",
            ),
            "owner@example.com",
        ))

        self.assertEqual(updated["id"], "statement-1")
        self.assertEqual(updated["card_id"], "card-1")
        self.assertEqual(updated["total_spend"], 1000.0)
        self.assertEqual(updated["points_earned"], 20.0)
        self.assertEqual(updated["reward_value"], 10.0)
        self.assertEqual(updated["transaction_count"], 1)
        self.assertEqual(updated["note"], "Corrected statement")

        transactions = statement_router.store.list("transactions", "owner@example.com")
        self.assertEqual(len(transactions), 1)
        self.assertEqual(transactions[0]["id"], "transaction-1")

    def test_update_rejects_another_statement_for_same_period(self):
        statement_router.store.add("statements", {
            "id": "statement-2",
            "user": "owner@example.com",
            "card_id": "card-1",
            "period_start": "2026-02-01",
            "period_end": "2026-02-28",
            "total_spend": 750.0,
        })

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(statement_router.update_statement(
                "statement-1",
                StatementUpdate(
                    period_start="2026-02-01",
                    period_end="2026-02-28",
                    total_spend=800.0,
                    points_earned=16.0,
                ),
                "owner@example.com",
            ))

        self.assertEqual(raised.exception.status_code, 409)
        unchanged = statement_router.store.get(
            "statements", "statement-1", "owner@example.com",
        )
        self.assertEqual(unchanged["period_end"], "2026-01-31")
        self.assertEqual(unchanged["total_spend"], 500.0)

    def test_transactions_include_a_readable_statement_filter_label(self):
        rows = asyncio.run(statement_router.list_transactions("owner@example.com"))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["statement_id"], "statement-1")
        self.assertEqual(
            rows[0]["statement_label"],
            "Test Bank Test Card · Statement · 2026-01-01 → 2026-01-31",
        )
        self.assertEqual(rows[0]["statement_period_end"], "2026-01-31")


if __name__ == "__main__":
    unittest.main()
