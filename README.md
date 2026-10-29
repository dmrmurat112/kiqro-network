# Kiqro Network

Kiqro's own offerwall / performance ad network. Product and technical spec: [docs/Kiqro_Offerwall_Agi_Dokuman.pdf](docs/Kiqro_Offerwall_Agi_Dokuman.pdf).

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Pure helpers: money in integer micros, HMAC signatures, URL macros |
| `packages/db` | Drizzle schema, migrations, ids, double-entry ledger |
| `packages/network` | Business rules shared by both apps: offers, clicks, postbacks, reversals, outbox; `./admin` holds admin auth, audit log and admin operations |
| `apps/tracking` | Fastify service: Offers API, click redirects, MMP/S2S postbacks, reversals, publisher postback worker |
| `apps/admin` | Next.js admin panel (Turkish UI): advertisers, top-ups, products, campaigns, publishers/placements, held-conversion review, postback logs |

## Local setup

Requires Node 22+ and Docker Desktop.

```bash
cp .env.example .env
npm install
npm run db:up        # Postgres in Docker (creates kiqro and kiqro_test databases)
npm run db:migrate
npm run seed         # demo advertiser, 3-step campaign, Kiqro app placement, $1000 balance
npm run dev          # http://localhost:4000
npm run worker       # delivers publisher postbacks
npm run create-admin -- you@kiqro.com "Ad Soyad" admin   # prints a one-time password
npm run dev:admin    # admin panel on http://localhost:4100
npm test
npm run typecheck
```

Admin roles: `admin` (everything), `operator` (advertisers, campaigns, conversion review), `finance` (top-ups), `viewer` (read only). Every change made in the panel is written to `audit_log`.

After changing `packages/db/src/schema.ts`, run `npm run db:generate` and commit the new migration.

## Endpoints (tracking service)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/offers?app_key&user_id&country&lang&sig` | Offers for one publisher user. `sig = HMAC(placement.secret, app_key\|user_id)` |
| GET | `/c/:campaignId?app_key&uid&sub1..sub5&sig` | Click → 302 to the advertiser tracking URL. `sig = HMAC(secret, campaign_id\|uid)`. Country from `CF-IPCountry` |
| GET/POST | `/v1/mmp/:postbackKey?click_id&event&event_ts&country&sig` | Install / in-app event postback. `sig = HMAC(advertiser secret, click_id\|event)` when the advertiser has a secret |
| GET | `/v1/mmp/:postbackKey/reversal?click_id&event&reason` | Chargeback of an approved conversion |

Publisher postbacks are sent to the placement's `postback_url` with `{user_id} {amount} {payout_usd} {transaction_id} {offer_id} {offer_name} {task_name} {status} {country} {signature}`; `status` is 1 for credit and 2 for chargeback, `signature = HMAC(secret, user_id|amount|transaction_id|status)`.

## Money rules

- Amounts are `bigint` micro-USD (1 USD = 1 000 000). No floats.
- Every money movement is a balanced ledger transaction (`ledger_entries` sum to zero per transaction); balances are derived from entries, never stored.
- Rewards are instant; reversals are chargebacks (spec decision K-8).
- User reward = publisher payout × placement `points_per_usd` (set by the publisher); publisher payout = advertiser price × placement `revshare_bps` (set by Kiqro admin per publisher).
