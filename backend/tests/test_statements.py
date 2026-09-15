import unittest

from app.services.statements import (
    extract_transactions,
    find_dates,
    guess_note,
    guess_period,
    guess_points,
    guess_total,
)


class StatementSummaryTests(unittest.TestCase):
    def test_icici_amazon_pay_earnings_and_month_first_period(self):
        text = """
        STATEMENT DATE
        July 5, 2026
        EARNINGS
        Earnings transfered to
        Earned
        Amazon Pay balance*
        146 140
        Statement period : June 6, 2026 to July 5, 2026
        """

        self.assertEqual(guess_points(text), 146.0)
        self.assertEqual(guess_period(text), ("2026-06-06", "2026-07-05"))
        self.assertEqual(guess_note("2026-06-06", "2026-07-05"), "July statement")
        self.assertEqual(find_dates("July 5, 2026"), ["2026-07-05"])

    def test_scapia_collapsed_summary_labels_and_dates(self):
        text = """
        Cardholder BillingCycle
        • XXXXXXXXXXXX1111 15Apr2026-24Apr2026
        TotalDue MinimumDue Accountsummary Rewardsearnedon
        ₹1,234.56 ₹123.45 transactions
        83
        StatementDate DueDate
        25 Apr 2026 13 May 2026 Convertedinto83ScapiaCoins
        TheTotalAmountDueinthisexampleis₹10,000.00
        """

        self.assertEqual(guess_total(text), 1234.56)
        self.assertEqual(guess_points(text), 83.0)
        self.assertEqual(guess_period(text), ("2026-04-15", "2026-04-24"))
        self.assertEqual(guess_note("2026-04-15", "2026-04-24"), "April statement")
        self.assertEqual(
            find_dates("15Apr2026-24Apr2026"),
            ["2026-04-15", "2026-04-24"],
        )

    def test_hdfc_summary_layout_still_parses(self):
        text = """
        Statement Date 21 Jan, 2026
        Billing Period 22 Dec, 2025 - 21 Jan, 2026
        PREVIOUS STATEMENT DUES FINANCE CHARGES TOTAL AMOUNT DUE
        RECEIVED (Current Billing Cycle)
        _ C10,721.00
        Reward Points Opening Balance Earned Disbursed Adjusted/Lapsed
        556
        555 1 0 0
        """

        self.assertEqual(guess_total(text), 10721.0)
        self.assertEqual(guess_points(text), 1.0)
        self.assertEqual(guess_period(text), ("2025-12-22", "2026-01-21"))
        self.assertEqual(guess_note("2025-12-22", "2026-01-21"), "January statement")


class StatementTransactionTests(unittest.TestCase):
    def test_hdfc_pipe_currency_glyph_and_pi_column(self):
        text = """
        21/12/2025| 00:00 TAX ONE (Ref# 10000000000001) C 38.34 l
        21/12/2025| 00:00 TAX TWO (Ref# 10000000000002) C 57.06 l
        30/12/2025| 11:52 CARD PAYMENT (Ref# 10000000000003) + C 10,122.00 l
        07/01/2026| 13:25 SPOTIFY MUMBAI C 119.00 l
        21/01/2026| 00:00 EMI PRINCIPAL ONE C 8,059.35 l
        21/01/2026| 00:00 EMI PRINCIPAL TWO C 2,051.00 l
        21/01/2026| 00:00 EMI INTEREST ONE C 107.00 l
        21/01/2026| 00:00 EMI INTEREST TWO C 290.00 l
        """

        rows = extract_transactions(text)

        self.assertEqual(len(rows), 8)
        debits = sum(row["amount"] for row in rows if not row["credit"])
        credits = sum(row["amount"] for row in rows if row["credit"])
        self.assertAlmostEqual(debits, 10721.75)
        self.assertAlmostEqual(credits, 10122.0)
        self.assertEqual(rows[2]["description"], "CARD PAYMENT (Ref# 10000000000003)")
        self.assertTrue(rows[2]["credit"])
        self.assertEqual(rows[3]["description"], "SPOTIFY MUMBAI")
        self.assertFalse(rows[3]["credit"])

    def test_scapia_middle_dot_reward_column_and_refund_sign(self):
        text = """
        18-04-2026·18:55 MerchantOne ₹1,206.17
        19-04-2026·11:21 MerchantTwo ₹850.00 43
        19-04-2026·19:02 MerchantThree ₹797.00 40
        20-04-2026·16:28 Fuelsurchargewaiver Refund +₹14.23
        08-05-2026·15:25 Cas*excelOneStopSoluJodhpurIn ₹99,999.00 10,000
        """

        rows = extract_transactions(text)

        self.assertEqual(len(rows), 5)
        self.assertEqual(
            [row["amount"] for row in rows],
            [1206.17, 850.0, 797.0, 14.23, 99999.0],
        )
        self.assertEqual(rows[1]["description"], "MerchantTwo")
        self.assertEqual(rows[3]["description"], "Fuelsurchargewaiver Refund")
        self.assertTrue(rows[3]["credit"])
        self.assertEqual(rows[4]["description"], "Cas*excelOneStopSoluJodhpurIn")
        self.assertFalse(rows[4]["credit"])

    def test_existing_amount_formats_are_preserved(self):
        text = """
        05/07/2026 UPI-ZOMATO 320
        06/07/2026 SHOP 20,538.00 Dr 308.00 Cr
        07/07/2026 PAYMENT RECEIVED 500 C
        08/07/2026 BOOKING REF 1234567890123
        """

        rows = extract_transactions(text)

        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["amount"], 320.0)
        self.assertFalse(rows[0]["credit"])
        self.assertEqual(rows[1]["amount"], 20538.0)
        self.assertFalse(rows[1]["credit"])
        self.assertEqual(rows[2]["amount"], 500.0)
        self.assertTrue(rows[2]["credit"])


if __name__ == "__main__":
    unittest.main()
