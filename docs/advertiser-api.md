# Kiqro Network — Advertiser API and webhooks

Pull your reports and manage campaigns from your own systems, and receive events as they happen.

## Authentication

Create a key in the advertiser panel: **API & webhooks → API keys** (team admins only). The key is shown once.

```
Authorization: Bearer kq_live_…
```

- A key acts as the teammate who created it. If that person is removed from the team, the key stops working.
- Revoke keys you no longer use. Up to 10 active keys per advertiser.
- Limit: 300 requests per minute per key (HTTP `429 rate_limited` above that).

**Base URL:** `https://track.kiqro.com/v1/advertiser`

Responses are JSON with `snake_case` fields. Amounts are decimal strings in USD (`"12.40"`). Times are ISO 8601 UTC.

## Endpoints

### `GET /me`

```json
{
  "organization": { "id": "org_…", "name": "Nordic Dragon Games" },
  "key_owner": { "name": "Aino Virtanen", "email": "aino@studio.com" },
  "balance_usd": "2150.40",
  "credit_limit_usd": "0.00",
  "spendable_usd": "2150.40",
  "credit_suspended": false
}
```

`spendable_usd` is what campaigns can still spend: the prepaid balance plus any credit line. With an overdue invoice the credit line is suspended.

### `GET /campaigns`

Lifetime funnel per campaign.

```json
{
  "campaigns": [
    {
      "id": "cmp_…", "name": "Dragon Realm – FI/SE", "status": "active", "app": "Dragon Realm", "platform": "android",
      "countries": ["FI", "SE"], "total_budget_usd": "5000.00", "spend_usd": "1412.60", "clicks": 8840,
      "steps": [
        { "seq": 1, "event": "install", "name": "Install and open", "completions": 709, "spend_usd": "425.40" },
        { "seq": 2, "event": "af_level_achieved_10", "name": "Reach level 10", "completions": 230, "spend_usd": "575.00" }
      ]
    }
  ]
}
```

`status`: `draft`, `in_review`, `active`, `paused`, `completed`, `archived`.

### `POST /campaigns/{id}/pause` and `POST /campaigns/{id}/resume`

Pauses or resumes a live campaign. Users who already started the offer can still finish it. Returns `{ "id": "cmp_…", "status": "paused" }`; `409` if the campaign is not live or paused.

### `GET /stats?days=7|30|90`

One row per UTC day, including empty days.

```json
{ "days": [ { "date": "2026-11-01", "spend_usd": "48.20", "installs": 24, "events": 11 } ] }
```

### `GET /conversions`

| Parameter | |
|---|---|
| `status` | `billed`, `not_billed`, `in_review`, `refunded` (optional) |
| `campaign_id` | optional |
| `limit` | 1–1000, default 100 |
| `before` | ISO time; pass `next_before` from the previous page |

```json
{
  "conversions": [
    { "id": "cnv_…", "created_at": "2026-11-02T10:01:00.000Z", "campaign": "Dragon Realm", "event": "install",
      "click_id": "clk_…", "country": "FI", "status": "billed", "reason": null, "price_usd": "0.60" }
  ],
  "next_before": "2026-11-02T10:01:00.000Z"
}
```

`click_id` is the value Kiqro put into your tracking link (`{click_id}`); use it to match your MMP raw data. `reason` explains `not_billed` rows (`timing`, `not_attributed`, `duplicate`, `not_targeted`, `balance`, `quality`).

### `GET /claims?status=open|approved|rejected`

Missing-credit claims: users who say they completed a step but were not rewarded.

```json
{
  "claims": [
    { "id": "clm_…", "status": "open", "campaign_id": "cmp_…", "event": "af_level_achieved_10", "click_id": "clk_…",
      "clicked_at": "2026-10-29T19:24:00.000Z", "country": "DE", "user_note": "Reached level 10 yesterday",
      "decision_note": null, "created_at": "2026-10-30T09:10:00.000Z" }
  ]
}
```

### `POST /claims/{id}/approve` and `POST /claims/{id}/reject`

Body (JSON): `{ "note": "…" }`. A reason is required to reject; it is shown to the user. Approving bills the step at its price and rewards the user, exactly like an MMP postback would.

| HTTP | `error` | |
|---|---|---|
| 404 | `claim_not_found` | |
| 409 | `claim_not_open` | Already decided |
| 409 | `claim_note_required` | Rejecting without a reason |
| 409 | `claim_balance` | Not enough balance or credit |
| 409 | `claim_no_price` | The step has no price for the user's country |
| 409 | `claim_reversed` | The conversion was refunded earlier |

## Webhooks

Add an endpoint in **API & webhooks → Webhooks** (team admins; up to 5). The URL must be public `https://`. Kiqro sends a `POST` with a JSON body for every event you subscribe to:

```json
{ "id": "whd_…", "type": "conversion.approved", "created": "2026-11-02T10:01:00.000Z", "data": { … } }
```

| Event | `data` |
|---|---|
| `conversion.approved` | `conversion_id, click_id, campaign_id, event, country, price_usd, status, event_at` |
| `conversion.reversed` | as above, with `status: "reversed"` and `reason` |
| `claim.created` | `claim_id, campaign_id, task_event, click_id, user_note` |
| `claim.decided` | `claim_id, status, note, conversion_id` |
| `payment.succeeded` | `payment_id, method, amount_usd` |
| `invoice.issued` | `invoice_id, number, amount_usd, due_at, period` |
| `balance.low` | `available_usd, threshold_usd` |
| `ping` | test event sent from the panel |

**Delivery.** Answer with any `2xx` within 10 seconds. Other answers, timeouts and redirects count as failures and are retried with growing intervals (about a day in total), then marked failed. The panel lists recent deliveries. Events can arrive more than once or out of order: use `id` to ignore duplicates.

**Signature.** Each request carries `Kiqro-Signature: t=<unix seconds>,v1=<hex>` where `v1 = HMAC-SHA256(signing secret, "<t>.<raw body>")`. Verify it with the endpoint's signing secret (`whsec_…`) before trusting the body, and reject timestamps older than 5 minutes.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyKiqro(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1 ?? '', 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

```php
function verify_kiqro(string $rawBody, string $header, string $secret): bool {
    parse_str(str_replace(',', '&', $header), $p);
    if (abs(time() - (int)($p['t'] ?? 0)) > 300) return false;
    $expected = hash_hmac('sha256', $p['t'] . '.' . $rawBody, $secret);
    return hash_equals($expected, $p['v1'] ?? '');
}
```

Use the raw request body exactly as received; re-encoding the JSON changes the signature.
