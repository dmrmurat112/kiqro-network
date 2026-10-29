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
| `apps/advertise` | advertise.kiqro.com — marketing site (EN/TR, demo request form) and the advertiser panel (`/app`: overview, campaign funnels, conversion log with CSV export, integration URLs, billing with Stripe top-ups and invoices; light/dark, EN/TR). Tailwind 4 + Geist |

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

Admin roles: `admin` (everything), `operator` (advertisers, campaigns, conversion review), `finance` (bank transfers, credit terms), `viewer` (read only). Every change made in the panel is written to `audit_log`.

Admin security: two-factor authentication (TOTP, any authenticator app) is mandatory — a new admin is sent to `/security` to enroll on first login. Five wrong attempts lock an e-mail for 15 minutes. If an admin loses their phone: `npm run reset-2fa -w @kiqro/admin -- email`. For local test accounts, `npm run dev-totp-code -w @kiqro/admin -- email` prints the current code (refuses to run against a non-local database).

## Advertiser team and 2FA

Kiqro staff create the first login of an advertiser (role `admin`). Advertiser admins invite teammates themselves on **Team** (`/app/team`) as `admin` (also manages the team) or `member`, change roles and remove people (removal disables the login and ends its sessions; a team always keeps one admin). Every user can turn on two-factor authentication (TOTP) in **Account**; turning it off needs the password and a current code. If a user loses their phone, staff reset it on the advertiser page in the admin panel.

## Advertiser API and webhooks

REST API at `/v1/advertiser/*` on the tracking service (Bearer keys created by team admins on **API & webhooks**; only a hash is stored) and signed webhooks (`Kiqro-Signature`, Stripe-style HMAC) for conversions, refunds, claims, payments, invoices and low balance, delivered with retries by the worker. Reference for advertisers: [docs/advertiser-api.md](docs/advertiser-api.md).

## E-mail

E-mail goes through SendGrid's v3 API. Messages are written to `email_messages` in the same transaction as the change that causes them, then delivered (with retries) by the worker; without `SENDGRID_API_KEY` the worker prints them to its console instead. Configure `MAIL_FROM` with an address on a domain authenticated in SendGrid (Settings → Sender Authentication), otherwise SendGrid rejects the messages.

| Template | When |
|---|---|
| `advertiser_invite` | Kiqro staff create an advertiser login: link to choose a password (72 h, single use) |
| `password_reset` | "Forgot password" on the advertiser login page (60 min, single use, max 3 per hour, silent for unknown addresses) |
| `low_balance` | Worker check every 10 min: balance under the advertiser's threshold (default $100), at most once a day |
| `lead_notification` | Demo request from the site, to `LEADS_NOTIFY_EMAIL` |
| `payment_received` | A card payment or recorded bank transfer was credited |
| `invoice_issued` | Monthly invoice for an advertiser on credit terms |
| `invoice_overdue` | Once per invoice when it passes its due date (credit line is then suspended) |

Templates are in `packages/network/src/email/templates.ts` (English and Turkish, by the user's panel language).

## Payments and credit terms

Advertisers are **prepaid** by default: campaigns spend the balance and stop taking new users when it runs out.

- **Card top-ups** (advertiser panel → Billing, `/app/billing`): minimum $500, maximum $50,000 per payment, through Stripe Checkout under the billing entity's Stripe account. The panel records a pending payment; the balance changes only when Stripe's webhook (`POST /api/stripe/webhook` on the advertise app, events `checkout.session.completed`, `…async_payment_succeeded`, `…async_payment_failed`, `…expired`) confirms it; `charge.refunded` takes Stripe refunds (also partial) off the balance, after checking the signature and that the charged amount matches. Webhooks are idempotent per Checkout Session. Without `STRIPE_SECRET_KEY`, development uses a stand-in checkout page; production shows card payments as unavailable.
- **Bank transfers**: finance records them in the admin panel (advertiser page → "Havale / manuel ödeme kaydı").
- **Credit terms (net-30)**: finance can give a credit-checked advertiser a credit line and payment term (admin → advertiser → "Kredi koşulları"). The balance may then go down to `-creditLimit`. In the first three days of each month the worker invoices the debt not covered by open invoices (numbers `KI-YYYY-NNNNN` for Kiqro Inc., `KO-…` for Kiqro Oy), due after the payment term. Any payment is applied to open invoices oldest first. When an invoice is overdue, the credit line is suspended automatically (only prepaid balance can be spent) until it is paid.

These invoices are internal statements of what is owed; the formal tax invoice format is to be confirmed with the accountant.

## Legal documents

Drafts of the Advertiser Terms, Advertising Content Policy, Privacy Notice, Data Protection Addendum, Sub-processors and Cookie Notice live in `apps/advertise/src/content/legal/` and are published at `/{en,tr}/legal`. They are **drafts pending legal review**: each page shows a banner, is excluded from search engines, and highlights open items as `[● …]`. Company details used across documents are in `entity.ts`.

When the lawyer approves a document: update its text, set `status: 'final'` and bump `version`. Panel users accept the Terms once per version (stored with time and IP, and in the audit log); set `TERMS_REQUIRED=true` to make acceptance mandatory before using the panel.

## Fraud controls

Clicks are refused for VPN/proxy/Tor and datacenter IPs, provider risk score ≥ 90, a Cloudflare/provider country mismatch, more than 60 clicks per IP per hour, or a publisher user risk ≥ 90. Conversions are held for review (not billed, not rewarded) for IP risk ≥ 75, publisher user risk ≥ 70, a fourth distinct user installing from one IP within 24 h (device farm), or more than 20 conversions per user per hour. Thresholds live in `packages/network/src/fraud/rules.ts`.

IP checks use IPQualityScore when `IPQS_API_KEY` is set (results cached for 6 h; lookups fail open). Publishers may pass their own user risk score as `risk=0..100` on the Offers API and click URLs; it is covered by the signature (`HMAC(secret, app_key|user_id|risk)` and `HMAC(secret, campaign_id|uid|risk)`), so users cannot alter it. The Kiqro app should send its existing fraud score this way.

After changing `packages/db/src/schema.ts`, run `npm run db:generate` and commit the new migration.

## Deployment

Staging runs on Render (Frankfurt) behind Cloudflare, defined in [`render.yaml`](render.yaml); images are built from `infra/docker/` (`node.Dockerfile` for tracking, worker and migrations; `next.Dockerfile` with `APP=admin|advertise`). GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs typecheck, tests and a "migrations committed" check; Render deploys `main` only when CI passes, running migrations before each deploy. Step-by-step setup (accounts, DNS, Cloudflare origin lock, first admin): [docs/test-ortami-kurulumu.md](docs/test-ortami-kurulumu.md).

Production is a separate Blueprint, [`render.production.yaml`](render.production.yaml), deployed from the `production` branch (`git push origin main:production` promotes what was tested on staging): [docs/canli-ortam-kurulumu.md](docs/canli-ortam-kurulumu.md).

Behind Cloudflare the tracking service reads the client IP from `CF-Connecting-IP` and the country from `CF-IPCountry`; with `ORIGIN_SECRET` set it refuses requests without the matching `X-Origin-Auth` header, which a Cloudflare Transform Rule adds.

## Publisher integration guide

The guide for the Kiqro app's developers (Offers API, click URLs, postbacks, signatures with test vectors, test plan) is [docs/kiqro-direct-entegrasyon.md](docs/kiqro-direct-entegrasyon.md), also as [PDF](docs/kiqro-direct-entegrasyon.pdf). Keep it in sync when the Offers API, click or postback contracts change.

## Endpoints (tracking service)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/offers?app_key&user_id&country&lang&sig` | Offers for one publisher user. `sig = HMAC(placement.secret, app_key\|user_id)` |
| GET | `/c/:campaignId?app_key&uid&sub1..sub5&sig` | Click → 302 to the advertiser tracking URL. `sig = HMAC(secret, campaign_id\|uid)`. Country from `CF-IPCountry` |
| GET/POST | `/v1/mmp/:postbackKey?click_id&event&event_ts&country&sig` | Install / in-app event postback. `sig = HMAC(advertiser secret, click_id\|event)` when the advertiser has a secret |
| GET | `/v1/mmp/:postbackKey/reversal?click_id&event&reason` | Chargeback of an approved conversion |
| POST | `/v1/claims` (`app_key, user_id, offer_id, task_id, note, sig`) | Missing-credit claim filed by the publisher for a user. `sig = HMAC(secret, app_key|user_id|offer_id|task_id)`. Matched to the user's click (last 30 days); advertisers decide it in the panel (Claims), Kiqro in the admin panel; approval bills the step and sends the normal reward postback |
| GET | `/v1/claims?app_key&user_id&sig` | A user's claims and their status |

Publisher postbacks are sent to the placement's `postback_url` with `{user_id} {amount} {payout_usd} {transaction_id} {offer_id} {offer_name} {task_name} {status} {country} {signature}`; `status` is 1 for credit and 2 for chargeback, `signature = HMAC(secret, user_id|amount|transaction_id|status)`.

## Money rules

- Amounts are `bigint` micro-USD (1 USD = 1 000 000). No floats.
- Every money movement is a balanced ledger transaction (`ledger_entries` sum to zero per transaction); balances are derived from entries, never stored.
- Rewards are instant; reversals are chargebacks (spec decision K-8).
- User reward = publisher payout × placement `points_per_usd` (set by the publisher); publisher payout = advertiser price × placement `revshare_bps` (set by Kiqro admin per publisher).
