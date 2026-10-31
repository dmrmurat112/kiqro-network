# Kiqro Network — publisher integration

For apps and sites that show Kiqro Network offers to their users and reward them. (The Kiqro app's own guide, in Turkish and with test vectors, is [kiqro-direct-entegrasyon.md](kiqro-direct-entegrasyon.md); the contracts are the same.)

## What you get from Kiqro

- A **publisher panel** login at `https://kiqronetwork.com/login`: earnings, placements, rewards log.
- One **placement** per app: an `app_key` (public) and a `secret` (server only), your revenue share (set in your agreement), and your own currency name and points-per-USD rate.

Never ship the `secret` inside an app. Everything signed is built on your server.

## Signatures

`sig = hex(HMAC-SHA256(secret, parts joined with "|"))`

| Request | Parts |
|---|---|
| Offerwall / Offers API | `app_key\|user_id` (or `app_key\|user_id\|risk`) |
| Claim | `app_key\|user_id\|offer_id\|task_id` |
| Reward postback (Kiqro → you) | `user_id\|amount\|transaction_id\|status` |

`user_id` is your stable, non-personal user identifier. `risk` (optional, 0–100) is your own fraud score; high values hold or block the user's conversions.

## Option 1 — hosted offerwall (fastest)

Open this URL in a WebView or the browser:

```
https://track.kiqronetwork.com/wall?app_key=APP_KEY&user_id=USER_ID&sig=SIG&lang=en
```

The page shows one card per offer (banner, step count, total reward in your currency) under the tabs *Offers*, *In progress* and *Completed*; tapping a card opens the offer's page with its steps, the start button and the missing-reward form. Optional parameters: `theme=light` for a light background (dark by default) and `offer=<offer_id>` to open one offer directly. Set your accent colour, logo and heading in the panel under **Placements → Offerwall look**. It uses no JavaScript and works inside any WebView. Open links to `track.kiqronetwork.com/c/…` in the system browser so the store opens correctly:

```kotlin
// Android
webView.webViewClient = object : WebViewClient() {
  override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
    if (req.url.path?.startsWith("/c/") == true) { startActivity(Intent(Intent.ACTION_VIEW, req.url)); return true }
    return false
  }
}
webView.loadUrl(wallUrl)
```

```swift
// iOS (WKNavigationDelegate)
func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
  if let url = action.request.url, url.path.hasPrefix("/c/") { UIApplication.shared.open(url); decisionHandler(.cancel); return }
  decisionHandler(.allow)
}
```

On the web, the wall can also be shown in an `<iframe>`.

## Option 2 — Offers API (your own UI)

```
GET https://track.kiqronetwork.com/v1/offers?app_key&user_id&sig[&risk][&lang][&country][&platform=android,ios][&category=games][&custom_1..5][&device_id]
```

Returns `{ offers: [{ offerId, title, description, instructions, category, platform, storeUrl, iconUrl, coverUrl, screenshots, isNew, clickUrl, totalRewardPoints, started, completed, tasks: [{ taskId, seq, name, timeLimitDays, payoutUsd, rewardPoints, state }] }], currency_sale: { multiplier, endsAt } | null }`. `platform` and `category` filter the list; `custom_1`..`custom_5` (your values, up to 200 characters, not signed) are carried in click URLs and returned in postbacks. During a currency sale the points are already multiplied. `device_id` (GAID / IDFA, when the user allows it) is carried in click URLs to the advertiser’s MMP link and improves install attribution. Open `clickUrl` unchanged. `payoutUsd` is your earning, not for display. Call from your server; pass `country` (ISO code) since Kiqro sees your server's address.

## Option 3 — Node.js SDK

The `@kiqro/direct-sdk` package (from your Kiqro contact) wraps all of the above:

```js
import { KiqroDirect } from '@kiqro/direct-sdk';
const kiqro = new KiqroDirect({ appKey: process.env.KIQRO_APP_KEY, secret: process.env.KIQRO_SECRET });

await kiqro.getOffers(userId, { lang: 'en', country: 'FI' });
kiqro.wallUrl(userId, { lang: 'en' });
kiqro.verifyPostback(req.query);              // true / false
await kiqro.fileClaim({ userId, offerId, taskId, note });
await kiqro.listClaims(userId);
```

## Rewards — postbacks

Set your postback URL in the panel (**Placements**) with macros, for example:

```
https://api.yourapp.com/kiqro?user={user_id}&amount={amount}&tx={transaction_id}&status={status}&sig={signature}
```

Macros: `{user_id} {amount} {payout_usd} {transaction_id} {offer_id} {offer_name} {offer_name_tr} {task_id} {task_name} {task_name_tr} {status} {country} {ip} {click_time} {event_time} {app_key} {reversal_reason} {custom_1}..{custom_5} {is_sandbox} {signature}`. Times are Unix seconds; `is_sandbox=1` marks postbacks sent from the panel tester (do not change balances). `amount` is in your points; `*_tr` names fall back to English; `status` is `1` (reward) or `2` (reversal: take the points back).

Your endpoint must: verify `signature`; credit at most once per `transaction_id` + `status`; answer `200` (anything else is retried with backoff). Use **Send test postback** or the **Postback tester** (any user, amount, reward or reversal) in the panel to check it. The IP addresses postbacks come from are listed on the panel’s Integration page (optional allowlist; always verify the signature).

## Publisher API

Signed with the placement secret; each call signs its own prefix so the offerwall's per-user signature never authorizes it.

- `GET /v1/publisher/stats?app_key&from=YYYY-MM-DD&to=YYYY-MM-DD&sig=HMAC(secret, "stats|app_key|from|to")`: daily `clicks, users, rewards, reversals, earnings_usd, points` (UTC, at most 92 days).
- `POST /v1/publisher/bans { app_key, user_id, reason, sig=HMAC(secret, "ban|app_key|user_id") }` and `POST /v1/publisher/unbans { app_key, user_id, sig=HMAC(secret, "unban|app_key|user_id") }`: banned users see no offers on any of your placements and their clicks are refused (`user_banned`).

Currency sales (a reward multiplier for a period) are set per placement in the panel.

## Missing rewards — claims

`POST https://track.kiqronetwork.com/v1/claims` (JSON or form) with `app_key, user_id, offer_id, task_id, note, sig`; `GET /v1/claims?app_key&user_id&sig` lists a user's claims with `status` (`open`, `approved`, `rejected`) and the rejection `note`. Claims must follow a click on the offer in the last 30 days. The hosted wall includes this form already.

## Checklist before going live

- [ ] Secret only on the server; signatures built server-side.
- [ ] Postback verified, idempotent, answers 200; reversals take points back.
- [ ] Offer links open in the system browser.
- [ ] Test postback from the panel succeeds; one real offer completed end to end on staging.
