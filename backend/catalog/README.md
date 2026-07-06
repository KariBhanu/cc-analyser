# Credit Card Catalog (India)

Curated reference base of credit cards available in India, one JSON file per issuer.
This is *catalog* data (public card terms), separate from user data in `backend/data/`
(which stays gitignored). Card entries carry a superset of the app's `CardIn` fields so
a catalog card can be imported into a user's account with one click later.

## Coverage roadmap (major → minor, ~10% per increment)

| % | Issuers | File(s) |
|---|---------|---------|
| 10 | HDFC Bank | `hdfc.json` |
| 20 | SBI Card | `sbi.json` |
| 30 | ICICI Bank | `icici.json` |
| 40 | Axis Bank (incl. migrated Citi cards) | `axis.json` |
| 50 | Kotak Mahindra, American Express | `kotak.json`, `amex.json` |
| 60 | IDFC FIRST, IndusInd | `idfc-first.json`, `indusind.json` |
| 70 | Yes Bank, RBL Bank | `yes.json`, `rbl.json` |
| 80 | AU Small Finance, Federal Bank, HSBC | `au.json`, `federal.json`, `hsbc.json` |
| 90 | Standard Chartered, BOBCARD (Bank of Baroda), PNB | `standard-chartered.json`, `bobcard.json`, `pnb.json` |
| 100 | IDBI, Union Bank, Canara, Bank of India, Indian Bank, other minor/PSU issuers | `psu-minor.json` |

## File schema

Each file:

```jsonc
{
  "bank": "HDFC Bank",          // display name
  "bank_slug": "hdfc",           // matches filename
  "tier": 1,                     // 1 = major, 2 = mid, 3 = minor
  "last_verified": "2026-07-06", // date the terms were checked
  "cards": [ { ...card } ]
}
```

Card object — fields marked (app) map 1:1 onto `CardIn` in `backend/app/models.py`:

```jsonc
{
  "name": "Millennia",                 // (app) card name without issuer prefix
  "slug": "hdfc-millennia",
  "network": ["Visa", "Mastercard"],  // card networks offered
  "variant": null,                     // e.g. "RuPay" when a variant differs in terms
  "category": "cashback",              // cashback | rewards | travel | premium | super-premium | co-branded | fuel | entry-level | business
  "status": "active",                  // active | discontinued (kept for holders)
  "joining_fee": 1000,
  "annual_fee": 1000,                  // (app)
  "fee_waiver_spend": 100000,          // (app: waiver_threshold) annual spend that waives renewal fee; 0 = none/LTF
  "base_points_per_100": 1,            // (app) reward units per Rs.100 default spend
  "rupee_per_point": 1.0,              // (app) value of ONE reward unit in Rs (best-typical redemption)
  "merchant_bonuses": [                // (app) accelerated categories/merchants, in points per Rs.100
    { "merchant": "Amazon", "points_per_100": 5 }
  ],
  "base_monthly_cap": 1000,            // (app) max base points/month; null = uncapped
  "bonus_monthly_cap": 1000,           // (app) max bonus points/month; null = uncapped
  "reward_currency": "CashPoints",     // what the card actually earns (points/cashback/miles name)
  "welcome_benefit": "…",              // joining perk, text
  "milestone_benefits": "…",           // spend-milestone perks, text
  "lounge_access": "…",                // domestic/international lounge terms, text
  "fuel_surcharge_waiver": "…",        // text incl. caps
  "forex_markup_pct": 3.5,
  "reward_exclusions": "…",            // fuel/rent/wallet/govt etc. that earn nothing
  "eligibility": "…",                  // income/age requirements, text
  "notes": "…",                        // caps, devaluations, gotchas
  "source_urls": ["https://…"],       // official bank pages used
  "last_verified": "2026-07-06"
}
```

Conventions:
- All money in INR. Fees exclude GST.
- `rupee_per_point` uses the typical *best sensible* redemption (e.g. SmartBuy flights for
  HDFC premium cards), noted in `notes` when redemption-dependent.
- Cashback cards: model cashback as points with `rupee_per_point: 1` (1 unit = Re.1).
- Percent-back cards: 1.5% cashback → `base_points_per_100: 1.5`, `rupee_per_point: 1`.
- Co-branded cards live in the issuing bank's file.
- When terms are uncertain or recently devalued, say so in `notes` rather than guessing.
