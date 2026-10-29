# Kiqro Direct — Kiqro uygulaması entegrasyon kılavuzu

**Sürüm 1.0 · 30 Ekim 2026 · Kiqro Network**

Bu kılavuz, Kiqro uygulamasının (web, iOS, Android) Kiqro'nun kendi offerwall ağı **Kiqro Direct**'i yeni bir teklif sağlayıcısı olarak bağlaması içindir. Entegrasyon, bugün bağlı olan diğer offerwall'lara (Torox, ayeT-Studios, AdscendMedia vb.) çok benzer: teklifler bir API'den çekilir, kullanıcı tıklama linkine yönlendirilir, ödül sunucudan sunucuya bildirim (postback) ile gelir.

---

## 1. Özet

Üç entegrasyon noktası var:

| # | Ne | Kim çağırır | Nereye |
|---|---|---|---|
| 1 | **Offers API** — kullanıcıya uygun teklifleri listeler | Kiqro backend (sunucudan) | `GET {TRACK}/v1/offers` |
| 2 | **Tıklama linki** — kullanıcıyı teklife yönlendirir | Kullanıcının cihazı (tarayıcı) | Offers API'nin döndürdüğü `clickUrl` |
| 3 | **Postback** — ödül ve geri alma bildirimi | Kiqro Network → Kiqro backend | Sizin belirlediğiniz URL |

`{TRACK}` takip servisinin adresidir:

| Ortam | Adres |
|---|---|
| Test (staging) | Test ortamı kurulunca iletilecek |
| Canlı | `https://track.kiqro.com` |

### Akış

1. Kullanıcı uygulamada offerwall'u açar. Uygulama, kendi backend'inizden teklif listesini ister.
2. Backend'iniz Offers API'yi **imzalı** olarak çağırır, gelen teklifleri diğer sağlayıcıların teklifleriyle aynı formata çevirip uygulamaya döner.
3. Kullanıcı bir teklife dokunur; uygulama `clickUrl`'i **değiştirmeden** sistem tarayıcısında açar.
4. Kiqro Network tıklamayı kaydeder ve kullanıcıyı mağazaya / reklamverenin sayfasına yönlendirir.
5. Kullanıcı uygulamayı yükler ve görevleri yapar. Reklamverenin MMP'si (AppsFlyer, Adjust…) her olayı Kiqro Network'e bildirir.
6. Kiqro Network olayı doğrular ve backend'inize **postback** gönderir (`status=1`). Backend'iniz kullanıcıya ödülü **hemen** verir.
7. Olay sonradan reklamveren tarafından fraud olarak geri alınırsa aynı işlem için `status=2` (chargeback) postback'i gelir; backend'iniz ödülü bakiyeden düşer.

---

## 2. Başlamadan önce Kiqro'dan alınacaklar

Kiqro ekibi admin panelinde Kiqro uygulaması için bir **placement** oluşturur ve size iletir:

| Bilgi | Örnek | Not |
|---|---|---|
| `app_key` | `app_8f2c1d9e0a7b3c45` | Herkese açık kimlik |
| `secret` | `…` (48 karakter) | **Gizli.** Yalnızca backend'de, ortam değişkeninde saklanır. Uygulamaya, web istemcisine ya da loglara asla konmaz. |
| Puan kuru | `1 USD = 1000 puan` | Kullanıcı ödülü bu kurla hesaplanır; Kiqro panelinden değiştirilir. |
| Postback adresiniz | `https://…/callbacks/kiqro-direct?…` | Sizin vereceğiniz adres; Kiqro panele girer (bkz. bölüm 6). |

> Test ve canlı ortam için **ayrı** `app_key` / `secret` verilir.

---

## 3. Offers API

### 3.1 İstek

```
GET {TRACK}/v1/offers?app_key={app_key}&user_id={user_id}&country={country}&lang={lang}&sig={sig}
```

| Parametre | Zorunlu | Açıklama |
|---|---|---|
| `app_key` | ✓ | Placement anahtarı |
| `user_id` | ✓ | Kiqro'daki **değişmeyen iç kullanıcı kimliği**. E-posta, telefon gibi kişisel veri **olamaz**. Postback'te aynı değer geri gelir. |
| `country` | ✓ | Kullanıcının ülkesi, ISO 3166 iki harf (`TR`, `FI`, `DE`). Hedefleme ve fiyat buna göre yapılır. |
| `lang` | | `en` veya `tr` (varsayılan `en`). Başlık ve görev adları bu dilde döner; çevirisi yoksa İngilizce. |
| `risk` | | Kiqro'nun kendi fraud skorundan 0–100 tam sayı (bkz. bölüm 7). Gönderilirse imzaya dahil edilir. |
| `sig` | ✓ | İmza (aşağıda) |

**İmza:** `HMAC-SHA256(secret, "app_key|user_id")`, küçük harf hex. `risk` gönderiliyorsa: `HMAC-SHA256(secret, "app_key|user_id|risk")`. İmza, URL'ye kodlanmamış (ham) değerler üzerinden hesaplanır.

### 3.2 Örnek (PHP)

```php
function kiqroSign(string $secret, array $parts): string {
    return hash_hmac('sha256', implode('|', $parts), $secret);
}

function kiqroDirectOffers(string $userId, string $country, string $lang, ?int $risk = null): array {
    $appKey = getenv('KIQRO_DIRECT_APP_KEY');
    $secret = getenv('KIQRO_DIRECT_SECRET');
    $parts  = [$appKey, $userId];
    $query  = ['app_key' => $appKey, 'user_id' => $userId, 'country' => $country, 'lang' => $lang];
    if ($risk !== null) {
        $parts[] = (string) $risk;
        $query['risk'] = (string) $risk;
    }
    $query['sig'] = kiqroSign($secret, $parts);

    $url = getenv('KIQRO_DIRECT_TRACK_URL') . '/v1/offers?' . http_build_query($query);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    // Kiqro Direct cevap vermezse offerwall diğer sağlayıcılarla açılmaya devam etmeli.
    if ($status !== 200 || $body === false) return [];
    return json_decode($body, true)['offers'] ?? [];
}
```

### 3.3 Örnek (Node.js)

```js
import { createHmac } from 'node:crypto';

const sign = (secret, parts) => createHmac('sha256', secret).update(parts.join('|')).digest('hex');

export async function kiqroDirectOffers(userId, country, lang, risk) {
  const { KIQRO_DIRECT_APP_KEY: appKey, KIQRO_DIRECT_SECRET: secret, KIQRO_DIRECT_TRACK_URL: base } = process.env;
  const parts = [appKey, userId];
  const query = new URLSearchParams({ app_key: appKey, user_id: userId, country, lang });
  if (risk !== undefined) { parts.push(String(risk)); query.set('risk', String(risk)); }
  query.set('sig', sign(secret, parts));
  try {
    const res = await fetch(`${base}/v1/offers?${query}`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? (await res.json()).offers : [];
  } catch {
    return []; // offerwall diğer sağlayıcılarla açılmaya devam eder
  }
}
```

### 3.4 Cevap

```json
{
  "offers": [
    {
      "offerId": "cmp_01JTESTCAMPAIGN0000000000",
      "title": "Dragon Realm",
      "description": "Install and reach the milestones within the time limit.",
      "platform": "android",
      "iconUrl": "https://…/icon.png",
      "clickUrl": "https://track.kiqro.com/c/cmp_01JTESTCAMPAIGN0000000000?app_key=app_8f2c1d9e0a7b3c45&uid=u_102938&sig=516c6a…",
      "totalRewardPoints": "6020",
      "started": true,
      "completed": false,
      "tasks": [
        { "seq": 1, "name": "Yükle ve aç",       "timeLimitDays": 1,  "payoutUsd": "0.28", "rewardPoints": "280",  "state": "credited" },
        { "seq": 2, "name": "10. seviyeye ulaş", "timeLimitDays": 7,  "payoutUsd": "1.54", "rewardPoints": "1540", "state": "open" },
        { "seq": 3, "name": "Satın alma yap",    "timeLimitDays": 14, "payoutUsd": "4.20", "rewardPoints": "4200", "state": "open" }
      ]
    }
  ]
}
```

| Alan | Açıklama |
|---|---|
| `offerId` | Teklifin kalıcı kimliği. Postback'teki `offer_id` ile aynı. |
| `title`, `description` | İstenen dilde. |
| `platform` | `android`, `ios` veya `web`. Kullanıcının cihazına uymayan teklifleri gizleyin. |
| `clickUrl` | **Olduğu gibi** açılacak, imzalı tıklama linki (bölüm 5). |
| `totalRewardPoints` | Tüm adımların toplam ödülü (puan). Sayı **string** olarak gelir. |
| `started` | Kullanıcı bu teklife daha önce tıkladı mı. Başlanmış teklifler, kampanya yeni kullanıcı almayı durdursa bile süreleri bitene kadar listede kalır. |
| `completed` | Tüm adımlar ödüllendirildi. Bu teklifleri "tamamlananlar" bölümüne taşıyabilirsiniz. |
| `tasks[].name`, `timeLimitDays` | Kullanıcıya gösterilecek adım adı ve kurulumdan itibaren tamamlama süresi (gün). |
| `tasks[].rewardPoints` | Bu adımın kullanıcıya ödülü (puan). |
| `tasks[].payoutUsd` | Kiqro uygulamasının bu adımdan aldığı USD payı. **Kullanıcıya gösterilmez**; muhasebe / kâr hesabı içindir. |
| `tasks[].state` | `open` (yapılmadı), `credited` (ödül verildi), `in_review` (inceleniyor), `rejected` (ödül verilmedi), `reversed` (geri alındı). |

Liste, başlanmış teklifler önce, sonra en yüksek ödüllü olacak şekilde sıralı gelir.

### 3.5 Önbellek

- Cevap **kullanıcıya özeldir**: bir kullanıcının listesini başka kullanıcıya göstermeyin.
- Kullanıcı başına en fazla **5 dakika** önbelleğe alınabilir. Kullanıcı bir görevi tamamlayıp ödül postback'i geldiğinde o kullanıcının önbelleğini temizleyin.
- Offers API'ye zaman aşımı **3 saniye** önerilir. Kiqro Direct cevap vermezse offerwall diğer sağlayıcılarla açılmaya devam etmelidir.

---

## 4. Uygulamada gösterim

Kiqro Direct, mevcut sağlayıcı birleştirme katmanına **"Kiqro Direct" adlı yeni bir sağlayıcı** olarak eklenir. Teklifler diğerleriyle aynı listede gösterilir; "Öne çıkan" rozeti ile işaretlenebilir.

**Teklif kartı:** ikon, başlık, toplam ödül (`totalRewardPoints`).

**Teklif detayı:**
- Adım listesi: her adımın adı, ödülü, süresi ve durumu (`state`). `credited` adımlar ✓ ile, `in_review` "inceleniyor" ile gösterilmeli.
- Kurallar metni (sabit):
  - "Uygulamayı daha önce yüklediyseniz ödül verilmez."
  - "VPN veya proxy kapalı olmalıdır."
  - "Adımlar, kurulumdan itibaren belirtilen süre içinde tamamlanmalıdır."
- **Görevi başlat** düğmesi → `clickUrl`.

`payoutUsd` hiçbir yerde kullanıcıya gösterilmez.

---

## 5. Tıklama linki

- `clickUrl`'i **değiştirmeden** açın. Parametre eklemek, çıkarmak ya da URL'yi yeniden kodlamak imzayı bozar.
- Linki **kullanıcının cihazı** açmalı. Kendi sunucunuz üzerinden yönlendirmeyin (proxy yapmayın). Kiqro Network ülkeyi ve fraud kontrollerini kullanıcının kendi IP adresinden yapar.
- **Android:** Chrome Custom Tabs veya harici tarayıcı. **iOS:** `SFSafariViewController` veya harici Safari. **Web:** yeni sekme.
- Uygulama içi WebView **kullanmayın**: mağaza yönlendirmeleri (`market://`, App Store) WebView'da çalışmaz.
- Tıklama reddedilirse (VPN, ülke, kampanya durmuş vb.) kullanıcı Türkçe veya İngilizce kısa bir açıklama sayfası görür. Ayrıca bir işlem yapmanız gerekmez.

---

## 6. Postback (Kiqro Network → Kiqro backend)

### 6.1 Adres

Bir HTTPS uç noktası açıp Kiqro'ya bildirin. Örnek şablon:

```
https://api.kiqro.com/callbacks/kiqro-direct?uid={user_id}&amount={amount}&payout={payout_usd}&tx={transaction_id}&offer={offer_id}&task={task_name}&status={status}&sig={signature}
```

Parametre adlarını (`uid`, `tx` …) siz seçersiniz; süslü parantezli makroları Kiqro Network doldurur. Kullanılabilen makrolar:

| Makro | Açıklama |
|---|---|
| `{user_id}` | Offers API'ye gönderdiğiniz `user_id` |
| `{amount}` | Kullanıcıya verilecek ödül (puan, tam sayı) |
| `{payout_usd}` | Kiqro uygulamasının USD payı (ör. `0.28`) |
| `{transaction_id}` | Bu adımın benzersiz işlem kimliği (`cnv_…`). Ödül ve geri alma aynı kimlikle gelir. |
| `{offer_id}`, `{offer_name}`, `{task_name}` | Teklif ve adım bilgisi |
| `{status}` | `1` = ödül ver, `2` = geri al (chargeback) |
| `{country}` | Tıklamadaki ülke |
| `{signature}` | İmza (aşağıda) |

**Zorunlu makrolar:** `{user_id}`, `{amount}`, `{transaction_id}`, `{status}`, `{signature}`.

### 6.2 İmza doğrulama

`signature = HMAC-SHA256(secret, "user_id|amount|transaction_id|status")`, küçük harf hex. Doğrulama her zaman **sabit süreli karşılaştırma** ile yapılmalı (PHP'de `hash_equals`, Node'da `timingSafeEqual`). İmzası tutmayan istek **hiçbir işlem yapılmadan** reddedilir.

### 6.3 İşleme kuralları

1. **İmzayı doğrula.** Tutmazsa `403` dön.
2. **Tekrarı yok say (idempotency).** `transaction_id` + `status` çifti daha önce işlendiyse hiçbir şey yapmadan `200` dön. Ağ hatalarında aynı postback birden fazla gelebilir.
3. **`status=1` (ödül):** `amount` kadar puanı kullanıcının bakiyesine **hemen** ekleyin, işlem geçmişine "Kiqro Direct — {offer_name}: {task_name}" olarak yazın.
4. **`status=2` (geri alma):** Aynı `transaction_id` ile verilen ödülü bakiyeden düşün.
   - Bakiye **eksiye düşebilir.**
   - Bakiyesi eksi olan kullanıcı, eksi kapanana kadar **para çekemez**.
   - Kullanıcıya bildirim gösterin ("Bir görev ödülü reklamveren tarafından geri alındı").
   - Tekrarlayan geri almalar Kiqro fraud skorunu yükseltmelidir.
5. **Hızlı cevap:** `2xx` dönün, en geç 10 saniye içinde. Ağır işleri kuyruğa alın.
6. **Kayıt:** Her postback'i ham haliyle saklayın (destek ve mutabakat için).

`2xx` dışındaki her cevap ya da zaman aşımı **başarısız** sayılır ve tekrar gönderilir: 1, 2, 4, 8 … dakika aralıklarla (en fazla 6 saat), toplam **10 deneme**. Sonra Kiqro admin panelinde "başarısız" olarak görünür ve elle yeniden gönderilebilir.

### 6.4 Örnek (PHP)

```php
// GET /callbacks/kiqro-direct
$secret = getenv('KIQRO_DIRECT_SECRET');
$uid    = $_GET['uid']    ?? '';
$amount = $_GET['amount'] ?? '';
$tx     = $_GET['tx']     ?? '';
$status = $_GET['status'] ?? '';
$sig    = $_GET['sig']    ?? '';

$expected = hash_hmac('sha256', implode('|', [$uid, $amount, $tx, $status]), $secret);
if (!hash_equals($expected, $sig) || !in_array($status, ['1', '2'], true) || !ctype_digit($amount)) {
    http_response_code(403);
    exit;
}

$db->beginTransaction();
// Benzersiz indeks: (provider, transaction_id, status).
// MySQL: INSERT IGNORE · PostgreSQL: INSERT … ON CONFLICT DO NOTHING
$insert = $db->prepare(
    "INSERT IGNORE INTO provider_transactions (provider, transaction_id, status, user_id, amount, raw)
     VALUES ('kiqro_direct', ?, ?, ?, ?, ?)"
);
$insert->execute([$tx, $status, $uid, $amount, $_SERVER['QUERY_STRING']]);

if ($insert->rowCount() === 1) {                 // ilk kez geliyor
    $delta = $status === '1' ? (int) $amount : -(int) $amount;
    $db->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$delta, $uid]);
}
$db->commit();
http_response_code(200);
echo 'OK';
```

(Örnek, işleme kurallarını göstermek içindir; kendi veri katmanınıza uyarlayın.)

### 6.5 Örnek (Node.js)

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyKiqroPostback(q, secret) {
  const expected = createHmac('sha256', secret).update([q.uid, q.amount, q.tx, q.status].join('|')).digest();
  const given = Buffer.from(String(q.sig ?? ''), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

---

## 7. Kiqro risk skoru (önerilir)

Kiqro'nun bugün kullandığı kullanıcı fraud skoru Kiqro Direct'e iletilebilir. Böylece riskli kullanıcıların dönüşümleri reklamverene faturalanmadan önce durdurulur.

- Offers API isteğine `risk=0..100` ekleyin. 0 güvenilir, 100 kesin fraud demektir. İmzaya dahil edin: `"app_key|user_id|risk"`.
- Değer, dönen `clickUrl`'lere imzalı olarak taşınır; kullanıcı linkle oynayıp değiştiremez.
- Kiqro Network'ün davranışı:
  - **70 ve üstü:** dönüşümler incelemeye alınır, ödül postback'i inceleme sonucuna göre gelir.
  - **90 ve üstü:** tıklama hiç kabul edilmez.

---

## 8. Güvenlik kontrol listesi

- [ ] `secret` yalnızca backend ortam değişkeninde; repoda, uygulamada, loglarda yok.
- [ ] Offers API yalnızca backend'den çağrılıyor.
- [ ] `user_id` kişisel veri içermiyor, kullanıcı başına sabit.
- [ ] Postback imzası `hash_equals` / `timingSafeEqual` ile doğrulanıyor.
- [ ] `transaction_id` + `status` için benzersiz kayıt; tekrar gelen postback ikinci kez bakiye değiştirmiyor.
- [ ] Eksi bakiyede para çekme engelleniyor.
- [ ] Postback uç noktası yalnızca HTTPS.

---

## 9. Test planı

Kiqro ekibi test ortamında, test reklamvereni ve test kampanyasıyla bir placement hazırlar.

**1. İmza testi** — `secret = test_secret_0123456789` ile kendi kodunuzun şu sonuçları ürettiğini doğrulayın:

| İmzalanan metin | Beklenen imza |
|---|---|
| `app_8f2c1d9e0a7b3c45\|u_102938` | `a7959642b96465a9c18d94310eb258442dcd5d3ac599f7fc3485a3eec07cc9df` |
| `app_8f2c1d9e0a7b3c45\|u_102938\|35` | `079cace1bf6c016056dbef57ae897520808bf266b185721f1f35f92e8085dde4` |
| `cmp_01JTESTCAMPAIGN0000000000\|u_102938` | `516c6a8195f1028cf5ed73ec2e29f9ab8509fde25e08dd9e1f44e797b626972f` |
| `u_102938\|2800\|cnv_01JTESTCONVERSION00000000\|1` | `8a472354508121e17ea9a525bb57992c4f70e273395a20a2985a7c748465007b` |
| `u_102938\|2800\|cnv_01JTESTCONVERSION00000000\|2` | `fd36c857cea610e3af1b65277a560c610914d9a768206154511656c92cca7e97` |

**2. Liste** — Test kullanıcısıyla offerwall'u açın; test teklifi "Kiqro Direct" altında doğru dilde, doğru ödüllerle görünmeli.

**3. Tıklama** — "Görevi başlat" sistem tarayıcısında açılmalı ve test mağaza sayfasına yönlenmeli.

**4. Ödül** — Kiqro ekibi test postback'i tetikler. Bakiye artmalı, işlem geçmişinde görünmeli, Offers API'de adım `credited` olmalı.

**5. Tekrar** — Kiqro ekibi aynı postback'i yeniden gönderir. Bakiye **değişmemeli**.

**6. Geri alma** — `status=2` postback'i gelir. Bakiye düşmeli; bakiye eksiye inerse para çekme kilitlenmeli.

**7. Hata durumu** — Uç noktanız `500` dönerken postback gönderilir. Kiqro admin panelinde yeniden deneme görünmeli; uç nokta düzelince ödül bir kez işlenmeli.

**8. VPN** — VPN açıkken tıklandığında kullanıcı açıklama sayfası görmeli.

---

## 10. Hata kodları

**Offers API**

| HTTP | `error` | Anlamı |
|---|---|---|
| 403 | `invalid_signature` | İmza hatalı (yanlış secret, yanlış sıra, kodlanmış değer) |
| 403 | `invalid_risk` | `risk` 0–100 arası tam sayı değil |
| 404 | `unknown_placement` | `app_key` tanımsız ya da placement durdurulmuş |

**Tıklama** (kullanıcı açıklama sayfası görür; API istemcileri JSON alır)

| HTTP | `error` | Anlamı |
|---|---|---|
| 400 | `missing_user_id`, `invalid_risk` | Link eksik ya da bozuk |
| 403 | `invalid_signature` | Link değiştirilmiş |
| 403 | `anonymizer`, `datacenter_ip`, `ip_high_risk`, `ip_country_mismatch`, `publisher_user_risk` | Fraud kontrolleri |
| 404 | `unknown_campaign`, `unknown_placement` | Teklif yok |
| 409 | `campaign_not_active`, `country_not_targeted`, `budget_exhausted`, `daily_budget_exhausted`, `advertiser_balance_empty` … | Teklif şu an yeni kullanıcı almıyor |
| 429 | `ip_click_velocity` | Aynı ağdan çok fazla tıklama |

---

## 11. Tamamlanma kriterleri

- [ ] Offerwall'da Kiqro Direct teklifleri diğer sağlayıcılarla birlikte görünüyor; Kiqro Direct cevap vermediğinde offerwall yine açılıyor.
- [ ] Teklif detayında adımlar, ödüller, süreler ve adım durumları görünüyor.
- [ ] Tıklama sistem tarayıcısında açılıyor; link değiştirilmiyor.
- [ ] Postback uç noktası imzayı doğruluyor, tekrarları yok sayıyor, ödülü anında veriyor.
- [ ] Geri alma bakiyeyi düşüyor; eksi bakiyede para çekme kapalı.
- [ ] Risk skoru gönderiliyor (önerilir).
- [ ] Bölüm 9'daki test planı test ortamında baştan sona geçti.

---

## 12. İletişim

Teknik sorular ve test postback'leri için Kiqro Network ekibi: **ads@kiqro.com**
