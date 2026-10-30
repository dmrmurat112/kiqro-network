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

The page lists available, in-progress and completed offers with their steps and rewards in your currency, opens offers, and lets users report a missing reward. It uses no JavaScript and works inside any WebView. Open links to `track.kiqronetwork.com/c/…` in the system browser so the store opens correctly:

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
GET https://track.kiqronetwork.com/v1/offers?app_key&user_id&sig[&risk][&lang][&country]
```

Returns `{ offers: [{ offerId, title, description, platform, iconUrl, clickUrl, totalRewardPoints, started, completed, tasks: [{ taskId, seq, name, timeLimitDays, payoutUsd, rewardPoints, state }] }] }`. Open `clickUrl` unchanged. `payoutUsd` is your earning, not for display. Call from your server; pass `country` (ISO code) since Kiqro sees your server's address.

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

Macros: `{user_id} {amount} {payout_usd} {transaction_id} {offer_id} {offer_name} {task_name} {status} {country} {signature}`. `amount` is in your points; `status` is `1` (reward) or `2` (reversal: take the points back).

Your endpoint must: verify `signature`; credit at most once per `transaction_id` + `status`; answer `200` (anything else is retried with backoff). Use **Send test postback** in the panel to check it.

## Missing rewards — claims

`POST https://track.kiqronetwork.com/v1/claims` (JSON or form) with `app_key, user_id, offer_id, task_id, note, sig`; `GET /v1/claims?app_key&user_id&sig` lists a user's claims with `status` (`open`, `approved`, `rejected`) and the rejection `note`. Claims must follow a click on the offer in the last 30 days. The hosted wall includes this form already.

## Checklist before going live

- [ ] Secret only on the server; signatures built server-side.
- [ ] Postback verified, idempotent, answers 200; reversals take points back.
- [ ] Offer links open in the system browser.
- [ ] Test postback from the panel succeeds; one real offer completed end to end on staging.
