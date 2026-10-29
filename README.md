# Kiqro Network

Kiqro's own offerwall / performance ad network. Product and technical spec: [docs/Kiqro_Offerwall_Agi_Dokuman.pdf](docs/Kiqro_Offerwall_Agi_Dokuman.pdf).

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Pure helpers: money in integer micros, HMAC signatures, URL macros |
| `packages/db` | Drizzle schema, migrations, ids, double-entry ledger |
| `packages/network` | Business rules shared by both apps: offers, clicks, postbacks, reversals, outbox; `./admin` holds admin auth, audit log and admin operations |
| `apps/tracking` | Fastify service: Offers API, click redirects, MMP/S2S postbacks, reversals, publisher postback worker |
| `apps/admin` | Next.js admin panel (Turkish UI): advertisers, top-ups, products, campaigns, publishers/placements, held-conversion review, postback logs, demo requests, advertiser logins |
| `apps/advertise` | advertise.kiqro.com — marketing site (EN/TR, demo request form) and the advertiser panel (`/app`: overview, campaign funnels, conversion log with CSV export, integration URLs; light/dark, EN/TR). Tailwind 4 + Geist |

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
npm run dev:advertise                # site + advertiser panel on http://localhost:4200
npm run seed:demo-advertiser         # dev only: 30 days of demo traffic + panel login (password in .env)
npm test
npm run typecheck
```

Admin roles: `admin` (everything), `operator` (advertisers, campaigns, conversion review), `finance` (top-ups), `viewer` (read only). Every change made in the panel is written to `audit_log`.

Admin security: two-factor authentication (TOTP, any authenticator app) is mandatory — a new admin is sent to `/security` to enroll on first login. Five wrong attempts lock an e-mail for 15 minutes. If an admin loses their phone: `npm run reset-2fa -w @kiqro/admin -- email`. For local test accounts, `npm run dev-totp-code -w @kiqro/admin -- email` prints the current code (refuses to run against a non-local database).

## Fraud controls

Clicks are refused for VPN/proxy/Tor and datacenter IPs, provider risk score ≥ 90, a Cloudflare/provider country mismatch, more than 60 clicks per IP per hour, or a publisher user risk ≥ 90. Conversions are held for review (not billed, not rewarded) for IP risk ≥ 75, publisher user risk ≥ 70, a fourth distinct user installing from one IP within 24 h (device farm), or more than 20 conversions per user per hour. Thresholds live in `packages/network/src/fraud/rules.ts`.

IP checks use IPQualityScore when `IPQS_API_KEY` is set (results cached for 6 h; lookups fail open). Publishers may pass their own user risk score as `risk=0..100` on the Offers API and click URLs; it is covered by the signature (`HMAC(secret, app_key|user_id|risk)` and `HMAC(secret, campaign_id|uid|risk)`), so users cannot alter it. The Kiqro app should send its existing fraud score this way.

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
