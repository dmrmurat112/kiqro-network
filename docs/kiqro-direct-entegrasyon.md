# Kiqro Direct — Kiqro uygulaması entegrasyon kılavuzu

**Sürüm 1.2 · 31 Ekim 2026 · Kiqro Network**

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
| Test (staging) | `https://track-staging.kiqronetwork.com` |
| Canlı | `https://track.kiqronetwork.com` |

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

Kiqro ekibi admin panelinde Kiqro uygulaması için bir **placement** oluşturur. Bilgilere Kiqro Network yayıncı panelinden de ulaşılır: `https://kiqronetwork.com` (test: `https://staging.kiqronetwork.com`) → **Placement'lar**.

| Bilgi | Örnek | Not |
|---|---|---|
| `app_key` | `app_8f2c1d9e0a7b3c45` | Herkese açık kimlik |
| `secret` | `…` (48 karakter) | **Gizli.** Yalnızca backend'de, ortam değişkeninde saklanır. Uygulamaya, web istemcisine ya da loglara asla konmaz. |
| Puan kuru | `1 USD = 1000 puan` | Kullanıcı ödülü bu kurla hesaplanır; Kiqro panelinden değiştirilir. |
| Postback adresiniz | `https://…/callbacks/kiqro-direct?…` | Sizin vereceğiniz adres; panelde **Placement'lar → Postback adresi** alanına girilir (bkz. bölüm 6). |

> Test ve canlı ortam için **ayrı** `app_key` / `secret` verilir.

Panelde ayrıca:
- **Test postback gönder** düğmesi, girilen adrese imzalı bir deneme ödülü gönderir ve sunucunuzun HTTP cevabını gösterir (bkz. bölüm 6.3).
- **Test offerwall** kutusu, kendi test kullanıcınız için imzalı bir link ve QR kod üretir; tekliflerin canlıda nasıl göründüğünü telefonda hemen görebilirsiniz.

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
| `platform` | | Yalnızca bu platformların teklifleri: `android`, `ios`, `web` (virgülle birden fazla). Kullanıcının cihazına göre gönderin. |
| `category` | | Yalnızca bu kategoriler: `games`, `finance`, `shopping`, `entertainment`, `lifestyle`, `utilities`, `other`. |
| `custom_1` … `custom_5` | | Sizin değerleriniz (en fazla 200 karakter). Tıklama linkine taşınır ve postback'te `{custom_1}` … `{custom_5}` olarak geri gelir; reklamverene gönderilmez. |
| `sig` | ✓ | İmza (aşağıda) |

**İmza:** `HMAC-SHA256(secret, "app_key|user_id")`, küçük harf hex. `platform`, `category` ve `custom_*` imzaya dahil değildir. `risk` gönderiliyorsa: `HMAC-SHA256(secret, "app_key|user_id|risk")`. İmza, URL'ye kodlanmamış (ham) değerler üzerinden hesaplanır.

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
      "coverUrl": "https://…/banner.jpg",
      "isNew": false,
      "screenshots": ["https://…/1.png", "https://…/2.png"],
      "category": "games",
      "instructions": "Oyunu yükleyin ve 10. seviyeye ulaşın. Seviye, ana ekranın sol üstünde görünür.",
      "clickUrl": "https://track.kiqronetwork.com/c/cmp_01JTESTCAMPAIGN0000000000?app_key=app_8f2c1d9e0a7b3c45&uid=u_102938&sig=516c6a…",
      "totalRewardPoints": "6020",
      "started": true,
      "completed": false,
      "tasks": [
        { "taskId": "tsk_01JTASKINSTALL000000000", "seq": 1, "name": "Yükle ve aç",       "timeLimitDays": 1,  "payoutUsd": "0.28", "rewardPoints": "280",  "state": "credited" },
        { "taskId": "tsk_01JTASKLEVEL10000000000", "seq": 2, "name": "10. seviyeye ulaş", "timeLimitDays": 7,  "payoutUsd": "1.54", "rewardPoints": "1540", "state": "open" },
        { "taskId": "tsk_01JTASKPURCHASE00000000", "seq": 3, "name": "Satın alma yap",    "timeLimitDays": 14, "payoutUsd": "4.20", "rewardPoints": "4200", "state": "open" }
      ]
    }
  ],
  "currency_sale": { "multiplier": 1.5, "endsAt": "2026-11-02T21:00:00.000Z" }
}
```

| Alan | Açıklama |
|---|---|
| `offerId` | Teklifin kalıcı kimliği. Postback'teki `offer_id` ile aynı. |
| `title`, `description` | İstenen dilde. |
| `platform` | `android`, `ios` veya `web`. Kullanıcının cihazına uymayan teklifleri gizleyin. |
| `iconUrl` | Uygulama ikonu (kare). `null` olabilir. |
| `coverUrl` | Geniş kapak görseli (yaklaşık 2:1), reklamveren eklediyse. `null` ise ikonu kullanın. |
| `isNew` | Teklif son 14 gün içinde yayına girdi; "Yeni" rozeti için. |
| `screenshots` | Mağaza ekran görüntüleri (https), teklif detayında gösterilebilir. |
| `category` | Teklif kategorisi (filtre ve sekmeler için). |
| `instructions` | Kullanıcıya adım adım talimat (istenen dilde; boş olabilir). Satır sonlarını koruyun. |
| `currency_sale` | (Cevabın üst seviyesinde) Şu an süren para birimi kampanyası ya da `null`. Ödüller zaten çarpılmış gelir; bu alan yalnızca "×1,5 ödül" bandı göstermek içindir (bölüm 9). |
| `clickUrl` | **Olduğu gibi** açılacak, imzalı tıklama linki (bölüm 5). |
| `totalRewardPoints` | Tüm adımların toplam ödülü (puan). Sayı **string** olarak gelir. |
| `started` | Kullanıcı bu teklife daha önce tıkladı mı. Başlanmış teklifler, kampanya yeni kullanıcı almayı durdursa bile süreleri bitene kadar listede kalır. |
| `completed` | Tüm adımlar ödüllendirildi. Bu teklifleri "tamamlananlar" bölümüne taşıyabilirsiniz. |
| `tasks[].taskId` | Adımın kimliği. Kayıp ödül talebinde kullanılır (bölüm 8). |
| `tasks[].name`, `timeLimitDays` | Kullanıcıya gösterilecek adım adı ve kurulumdan itibaren tamamlama süresi (gün). |
| `tasks[].rewardPoints` | Bu adımın kullanıcıya ödülü (puan). |
| `tasks[].payoutUsd` | Kiqro uygulamasının bu adımdan aldığı USD payı. **Kullanıcıya gösterilmez**; muhasebe / kâr hesabı içindir. |
| `tasks[].state` | `open` (yapılmadı), `credited` (ödül verildi), `in_review` (inceleniyor), `rejected` (ödül verilmedi), `reversed` (geri alındı). |

Liste sıralı gelir: önce başlanmış teklifler, sonra tıklama başına en çok kazandırması beklenenler, eşitlikte en yüksek ödüllü. Bu sırayı korumanız gelirinizi artırır.

Görsel adresleri (`iconUrl`, `coverUrl`) https'tir; uygulamada doğrudan gösterilebilir.

### 3.5 Önbellek

- Cevap **kullanıcıya özeldir**: bir kullanıcının listesini başka kullanıcıya göstermeyin.
- Kullanıcı başına en fazla **5 dakika** önbelleğe alınabilir. Kullanıcı bir görevi tamamlayıp ödül postback'i geldiğinde o kullanıcının önbelleğini temizleyin.
- Offers API'ye zaman aşımı **3 saniye** önerilir. Kiqro Direct cevap vermezse offerwall diğer sağlayıcılarla açılmaya devam etmelidir.

---

## 4. Uygulamada gösterim

Kiqro Direct, mevcut sağlayıcı birleştirme katmanına **"Kiqro Direct" adlı yeni bir sağlayıcı** olarak eklenir. Teklifler diğerleriyle aynı listede gösterilir; "Öne çıkan" rozeti ile işaretlenebilir.

**Teklif kartı:** kapak görseli (`coverUrl`, yoksa ikon), ikon, başlık, adım sayısı, toplam ödül (`totalRewardPoints`); `isNew` ise "Yeni" rozeti.

**Teklif detayı:**
- `instructions` metni ve `screenshots` (varsa).
- Adım listesi: her adımın adı, ödülü, süresi ve durumu (`state`). `credited` adımlar ✓ ile, `in_review` "inceleniyor" ile gösterilmeli.
- Kurallar metni (sabit):
  - "Uygulamayı daha önce yüklediyseniz ödül verilmez."
  - "VPN veya proxy kapalı olmalıdır."
  - "Adımlar, kurulumdan itibaren belirtilen süre içinde tamamlanmalıdır."
- **Görevi başlat** düğmesi → `clickUrl`.

`payoutUsd` hiçbir yerde kullanıcıya gösterilmez.

### Alternatif: hazır offerwall

Kendi arayüzünüzü yapmadan önce ya da web sürümü için, Kiqro Network'ün hazır offerwall sayfası da kullanılabilir. Sayfa mobil uyumludur; kartlar, teklif detayı ve kayıp ödül formu içinde gelir. Renk, logo ve başlık panelde **Placement'lar → Offerwall görünümü** bölümünden ayarlanır.

```
{TRACK}/wall?app_key={app_key}&user_id={user_id}&lang=tr&sig={sig}          (sig: Offers API ile aynı)
```

İsteğe bağlı parametreler: `theme=light` (açık tema), `offer={offerId}` (bir teklifi doğrudan açar), `risk` (bölüm 7; imzaya dahil). Link backend'de üretilir ve WebView'da ya da `<iframe>` içinde açılır. WebView kullanılıyorsa `{TRACK}/c/…` linkleri sistem tarayıcısında açılmalıdır (bölüm 5). Ödüller yine bölüm 6'daki postback ile gelir.

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
https://api.kiqro.com/callbacks/kiqro-direct?uid={user_id}&amount={amount}&payout={payout_usd}&tx={transaction_id}&offer={offer_id}&task={task_id}&title={offer_name_tr}&step={task_name_tr}&status={status}&sig={signature}
```

Parametre adlarını (`uid`, `tx` …) siz seçersiniz; süslü parantezli makroları Kiqro Network doldurur. Kullanılabilen makrolar:

| Makro | Açıklama |
|---|---|
| `{user_id}` | Offers API'ye gönderdiğiniz `user_id` |
| `{amount}` | Kullanıcıya verilecek ödül (puan, tam sayı) |
| `{payout_usd}` | Kiqro uygulamasının USD payı (ör. `0.28`) |
| `{transaction_id}` | Bu adımın benzersiz işlem kimliği (`cnv_…`). Ödül ve geri alma aynı kimlikle gelir. |
| `{offer_id}`, `{task_id}` | Teklif ve adım kimliği; Offers API'deki `offerId` ve `tasks[].taskId` ile aynı. |
| `{offer_name}`, `{task_name}` | Teklif ve adım adı (İngilizce) |
| `{offer_name_tr}`, `{task_name_tr}` | Teklif ve adım adı (Türkçe; çevirisi yoksa İngilizce) |
| `{status}` | `1` = ödül ver, `2` = geri al (chargeback) |
| `{country}` | Tıklamadaki ülke |
| `{ip}` | Kullanıcının tıklamadaki IP adresi (fraud analizi için) |
| `{click_time}`, `{event_time}` | Tıklama ve olay zamanı (Unix saniye) |
| `{app_key}` | Placement anahtarı; birden fazla placement aynı adresi kullanıyorsa ayırt etmek için |
| `{reversal_reason}` | Geri almanın nedeni (yalnızca `status=2`'de dolu) |
| `{custom_1}` … `{custom_5}` | Offers API / offerwall isteğinde gönderdiğiniz değerler |
| `{is_sandbox}` | `1` = panelden gönderilen test postback'i, `0` = gerçek ödül |
| `{signature}` | İmza (aşağıda) |

**Zorunlu makrolar:** `{user_id}`, `{amount}`, `{transaction_id}`, `{status}`, `{signature}`.

Adres **https** olmalı ve herkese açık bir sunucuya gitmelidir (iç ağ / özel IP adreslerine postback gönderilmez). Değerler URL için kodlanmış gelir; çoğu framework bunları otomatik çözer.

### 6.2 İmza doğrulama

`signature = HMAC-SHA256(secret, "user_id|amount|transaction_id|status")`, küçük harf hex. Doğrulama her zaman **sabit süreli karşılaştırma** ile yapılmalı (PHP'de `hash_equals`, Node'da `timingSafeEqual`). İmzası tutmayan istek **hiçbir işlem yapılmadan** reddedilir.

### 6.3 İşleme kuralları

1. **İmzayı doğrula.** Tutmazsa `403` dön.
2. **Tekrarı yok say (idempotency).** `transaction_id` + `status` çifti daha önce işlendiyse hiçbir şey yapmadan `200` dön. Ağ hatalarında aynı postback birden fazla gelebilir.
3. **`status=1` (ödül):** `amount` kadar puanı kullanıcının bakiyesine **hemen** ekleyin, işlem geçmişine "Kiqro Direct — {offer_name_tr}: {task_name_tr}" olarak yazın.
4. **`status=2` (geri alma):** Aynı `transaction_id` ile verilen ödülü bakiyeden düşün.
   - Bakiye **eksiye düşebilir.**
   - Bakiyesi eksi olan kullanıcı, eksi kapanana kadar **para çekemez**.
   - Kullanıcıya bildirim gösterin ("Bir görev ödülü reklamveren tarafından geri alındı").
   - Tekrarlayan geri almalar Kiqro fraud skorunu yükseltmelidir.
5. **Hızlı cevap:** `2xx` dönün, en geç 10 saniye içinde. Ağır işleri kuyruğa alın.
6. **Kayıt:** Her postback'i ham haliyle saklayın (destek ve mutabakat için).
7. **Sandbox:** `is_sandbox=1` gelen postback'ler panelden gönderilen testlerdir. İmzayı doğrulayıp kaydedin ama bakiyeyi değiştirmeden `200` dönün.
8. **Panel testi:** "Test postback gönder" düğmesi `user_id=kiqro_test_user`, `transaction_id=test_…`, `offer_id=cmp_TEST`, `task_id=tsk_TEST` değerleriyle, geçerli imzayla gelir. Bu kullanıcı sizde yoksa bakiye değiştirmeden `200` dönün; amaç uç noktanın erişilebilir olduğunu ve imzanın tuttuğunu görmektir.

`2xx` dışındaki her cevap ya da zaman aşımı **başarısız** sayılır ve tekrar gönderilir: 1, 2, 4, 8 … dakika aralıklarla (en fazla 6 saat), toplam **10 deneme**. Sonra Kiqro admin panelinde "başarısız" olarak görünür ve elle yeniden gönderilebilir.

**IP listesi (isteğe bağlı):** Postback'lerin geldiği IP adresleri yayıncı panelinde **Entegrasyon** sayfasında yazar. Güvenlik duvarınızda izin listesi tutuyorsanız bunları ekleyin; imza doğrulaması her durumda zorunludur.

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

## 8. Kayıp ödül talepleri

Kullanıcı bir adımı tamamladığını ama ödül almadığını söylerse, uygulama içinden talep açtırın. Kiqro Network talebi kullanıcının tıklamasıyla eşleştirir ve reklamverene iletir. Reklamveren onaylarsa ödül normal postback ile gelir (`status=1`, yeni `transaction_id`). Reddederse gerekçe talep listesinde görünür.

**Talep açma** (backend'den):

```
POST {TRACK}/v1/claims
Content-Type: application/json   (veya application/x-www-form-urlencoded)

{ "app_key": "…", "user_id": "u_102938", "offer_id": "cmp_…", "task_id": "tsk_…", "note": "10. seviyeye dün ulaştım", "sig": "…" }
```

- İmza: `sig = HMAC_SHA256(secret, "app_key|user_id|offer_id|task_id")`, hex.
- `note` isteğe bağlı; en fazla 1000 karakter, reklamverene gösterilir.
- Cevap: `{ "claim_id": "clm_…", "status": "open" }`. Aynı kullanıcı ve adım için tekrar gönderilirse mevcut talep döner.

| HTTP | `error` | Anlamı |
|---|---|---|
| 400 | `missing_parameters` | Alan eksik |
| 403 | `invalid_signature` | İmza hatalı |
| 404 | `unknown_placement`, `unknown_task` | `app_key` ya da adım tanımsız |
| 409 | `no_click` | Kullanıcının son 30 günde bu teklife tıklaması yok |
| 409 | `already_rewarded` | Bu adım zaten ödüllendirilmiş |

**Kullanıcının talepleri** (uygulamada "Taleplerim" ekranı için):

```
GET {TRACK}/v1/claims?app_key=…&user_id=…&sig=HMAC(secret, "app_key|user_id")
```

Cevap: `{ "claims": [ { "claim_id", "offer_id", "task_id", "status": "open" | "approved" | "rejected", "note", "created_at", "decided_at" } ] }`. `note`, ret gerekçesidir.

Öneriler:
- Talep butonunu yalnızca `state` değeri `open` ya da `rejected` olan adımlarda, kullanıcı teklife tıkladıktan sonra gösterin.
- Kullanıcıya bekleme süresini söyleyin: reklamveren genelde 3–7 iş günü içinde karar verir.

---

## 8.1 Para birimi kampanyası

Panelde **Placement → Para birimi kampanyası** bölümünden belirli bir süre için ödülleri katlayabilirsiniz (×1,01–×5, en fazla 31 gün; ör. hafta sonu ×1,5).

- Kampanya süresince **tıklanan** tekliflerin ödülleri çarpılır. Kullanıcı görevi kampanya bittikten sonra tamamlasa da çarpılmış ödülü alır.
- Offers API'deki `rewardPoints` / `totalRewardPoints` ve postback'teki `{amount}` çarpılmış gelir; ayrıca hesap yapmanız gerekmez.
- Ek ödülü kendi para biriminizle siz verirsiniz; `{payout_usd}` (Kiqro uygulamasının USD payı) değişmez.
- Cevaptaki `currency_sale` alanıyla uygulamada "×1,5 ödül — Pazar 23:59'a kadar" gibi bir bant gösterin.

## 8.2 Kullanıcı engelleme

Fraud yapan kullanıcıları Kiqro Direct'ten engelleyebilirsiniz. Engellenen kullanıcı hiçbir placement'ta teklif görmez (Offers API boş liste döner), tıklamaları reddedilir. Panelde **Engellenenler** sayfasından ya da sunucunuzdan:

```
POST {TRACK}/v1/publisher/bans     { "app_key", "user_id", "reason", "sig" }   sig = HMAC(secret, "ban|app_key|user_id")
POST {TRACK}/v1/publisher/unbans   { "app_key", "user_id", "sig" }             sig = HMAC(secret, "unban|app_key|user_id")
```

İmzanın başındaki `ban|` / `unban|` öneki zorunludur: offerwall linkindeki imza (kullanıcı görebilir) bu işlemler için geçmez.

## 8.3 İstatistik API'si

Günlük rakamlar (UTC günleri, tek istekte en fazla 92 gün):

```
GET {TRACK}/v1/publisher/stats?app_key=…&from=2026-10-01&to=2026-10-31&sig=HMAC(secret, "stats|app_key|from|to")
```

Cevap: `{ "app_key", "currency_name", "days": [ { "date", "clicks", "users", "rewards", "reversals", "earnings_usd", "points" } ] }`. `earnings_usd` geri almalardan sonraki net tutardır.

## 8.4 Postback test aracı

Panelde **Placement → Postback test aracı** ile kullanıcı kimliği, tutar, teklif/adım ID, tür (ödül / geri alma) ve `custom_*` değerlerini seçip gerçek formatta, geçerli imzalı bir postback gönderebilirsiniz. Bu postback'ler `is_sandbox=1` ile gelir; hiçbir şey kaydedilmez veya faturalanmaz. Sunucunuzun döndüğü HTTP kodu ve gönderilen adres ekranda görünür.

---

## 9. Güvenlik kontrol listesi

- [ ] `secret` yalnızca backend ortam değişkeninde; repoda, uygulamada, loglarda yok.
- [ ] Offers API yalnızca backend'den çağrılıyor.
- [ ] `user_id` kişisel veri içermiyor, kullanıcı başına sabit.
- [ ] Postback imzası `hash_equals` / `timingSafeEqual` ile doğrulanıyor.
- [ ] `transaction_id` + `status` için benzersiz kayıt; tekrar gelen postback ikinci kez bakiye değiştirmiyor.
- [ ] Eksi bakiyede para çekme engelleniyor.
- [ ] Postback uç noktası yalnızca HTTPS.
- [ ] `is_sandbox=1` postback'leri bakiyeyi değiştirmiyor.

---

## 10. Test planı

Kiqro ekibi test ortamında, test reklamvereni ve test kampanyasıyla bir placement hazırlar.

**1. İmza testi** — `secret = test_secret_0123456789` ile kendi kodunuzun şu sonuçları ürettiğini doğrulayın:

| İmzalanan metin | Beklenen imza |
|---|---|
| `app_8f2c1d9e0a7b3c45\|u_102938` | `a7959642b96465a9c18d94310eb258442dcd5d3ac599f7fc3485a3eec07cc9df` |
| `app_8f2c1d9e0a7b3c45\|u_102938\|35` | `079cace1bf6c016056dbef57ae897520808bf266b185721f1f35f92e8085dde4` |
| `cmp_01JTESTCAMPAIGN0000000000\|u_102938` | `516c6a8195f1028cf5ed73ec2e29f9ab8509fde25e08dd9e1f44e797b626972f` |
| `u_102938\|2800\|cnv_01JTESTCONVERSION00000000\|1` | `8a472354508121e17ea9a525bb57992c4f70e273395a20a2985a7c748465007b` |
| `u_102938\|2800\|cnv_01JTESTCONVERSION00000000\|2` | `fd36c857cea610e3af1b65277a560c610914d9a768206154511656c92cca7e97` |
| `app_8f2c1d9e0a7b3c45\|u_102938\|cmp_01JTESTCAMPAIGN0000000000\|tsk_01JTASKLEVEL10000000000` | `550c1abe8607314b6d6f25648c5532483650e15957149d6c0a4a7449015563c1` |

**2. Liste** — Test kullanıcısıyla offerwall'u açın; test teklifi "Kiqro Direct" altında doğru dilde, doğru ödüllerle görünmeli.

**3. Tıklama** — "Görevi başlat" sistem tarayıcısında açılmalı ve test mağaza sayfasına yönlenmeli.

**4. Ödül** — Önce paneldeki **Test postback gönder** ile uç noktanızın `200` döndüğünü görün. Sonra Kiqro ekibi test kampanyasında gerçek bir dönüşüm tetikler (MMP yerine sunucudan sunucuya postback ile). Bakiye artmalı, işlem geçmişinde Türkçe adla görünmeli, Offers API'de adım `credited` olmalı.

**5. Tekrar** — Kiqro ekibi aynı postback'i yeniden gönderir. Bakiye **değişmemeli**.

**6. Geri alma** — `status=2` postback'i gelir. Bakiye düşmeli; bakiye eksiye inerse para çekme kilitlenmeli.

**7. Hata durumu** — Uç noktanız `500` dönerken postback gönderilir. Kiqro admin panelinde yeniden deneme görünmeli; uç nokta düzelince ödül bir kez işlenmeli.

**8. VPN** — VPN açıkken tıklandığında kullanıcı açıklama sayfası görmeli.

**10. Sandbox** — Postback test aracıyla `status=1` ve `status=2` gönderin; uç nokta `200` dönmeli, bakiye değişmemeli.

**11. Engelleme** — Test kullanıcısını engelleyin; Offers API boş liste dönmeli, offerwall'da teklif görünmemeli. Engeli kaldırınca teklifler geri gelmeli.

**9. Kayıp ödül talebi** — Test kullanıcısı, tıkladığı ama ödül almadığı bir adım için talep açar; talep "Taleplerim" ekranında `open` görünmeli. Kiqro ekibi talebi onaylayınca ödül postback'i gelmeli ve talep `approved` olmalı; reddedilen talepte gerekçe görünmeli.

---

## 11. Hata kodları

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
| 403 | `user_banned` | Kullanıcı yayıncı tarafından engellenmiş (kullanıcıya genel bir mesaj gösterilir) |
| 404 | `unknown_campaign`, `unknown_placement` | Teklif yok |
| 409 | `campaign_not_active`, `country_not_targeted`, `budget_exhausted`, `daily_budget_exhausted`, `advertiser_balance_empty` … | Teklif şu an yeni kullanıcı almıyor |
| 429 | `ip_click_velocity` | Aynı ağdan çok fazla tıklama |

---

## 12. Tamamlanma kriterleri

- [ ] Offerwall'da Kiqro Direct teklifleri diğer sağlayıcılarla birlikte görünüyor; Kiqro Direct cevap vermediğinde offerwall yine açılıyor.
- [ ] Teklif detayında adımlar, ödüller, süreler ve adım durumları görünüyor.
- [ ] Tıklama sistem tarayıcısında açılıyor; link değiştirilmiyor.
- [ ] Postback uç noktası imzayı doğruluyor, tekrarları yok sayıyor, ödülü anında veriyor.
- [ ] Geri alma bakiyeyi düşüyor; eksi bakiyede para çekme kapalı.
- [ ] Risk skoru gönderiliyor (önerilir).
- [ ] Kullanıcı uygulama içinden kayıp ödül talebi açabiliyor ve taleplerinin durumunu görebiliyor.
- [ ] Bölüm 10'daki test planı test ortamında baştan sona geçti.

---

## 13. İletişim

Teknik sorular ve test postback'leri için Kiqro Network ekibi: **contact@kiqro.com**
