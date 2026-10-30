# Test ortamı (staging) kurulumu — Render + Cloudflare

Bu belge Kiqro Network test ortamının kurulumunu adım adım anlatır. Kodla ilgili her şey depoda hazır:

- `render.yaml`: servisler, veritabanı, ortam değişkenleri
- `infra/docker/*.Dockerfile`: imajlar
- `.github/workflows/ci.yml`: otomatik testler

Aşağıdaki adımlar hesap ve erişim gerektirdiği için sizin tarafınızdan yapılır. Toplam süre yaklaşık **1–1,5 saat** (DNS ve sertifika beklemesi dahil).

## Ne kurulacak

| Servis | Render adı | Adres | Görev |
|---|---|---|---|
| Takip servisi | `kiqro-staging-track` | `https://track-staging.kiqronetwork.com` | Offers API, tıklamalar, MMP postback'leri |
| İşçi (worker) | `kiqro-staging-worker` | — | Yayıncı postback'leri, e-postalar, bakiye uyarıları |
| Reklamveren sitesi ve paneli | `kiqro-staging-advertise` | `https://staging.kiqronetwork.com` | Tanıtım sitesi, reklamveren paneli |
| Admin paneli | `kiqro-staging-admin` | `https://admin-staging.kiqronetwork.com` | Kiqro ekibi |
| Veritabanı | `kiqro-staging-db` | (yalnızca iç ağ) | PostgreSQL 17 |

Hepsi Render **Frankfurt** bölgesinde çalışır. Tahmini maliyet ayda yaklaşık **35 $**: 4 × Starter servis ve küçük Postgres. Güncel fiyatlar için Render'ın fiyat sayfasına bakın.

> Alan adları tek seviyeli (`track-staging.kiqronetwork.com`). Cloudflare'in ücretsiz sertifikası `track.staging.kiqronetwork.com` gibi iki seviyeli adları kapsamaz.

**Alan adı ve e-posta:** Ağın adresi `kiqronetwork.com` (GoDaddy'den alındı, DNS'i Cloudflare yönetir). E-postalar `kiqro.com` üzerinden gider: gönderici `noreply@kiqro.com`, cevaplar ve iletişim `contact@kiqro.com`.

---

## 0. Alan adını Cloudflare'e taşıma (bir kez, ~15 dk + yayılma süresi)

Sistem kullanıcının ülkesini ve gerçek IP'sini Cloudflare'den okur ve takip servisini Cloudflare arkasına kilitler. Bu yüzden `kiqronetwork.com`'un DNS'i Cloudflare'de olmalı.

1. Cloudflare → **Add a domain** → `kiqronetwork.com` → **Free** plan. Cloudflare mevcut kayıtları tarar; GoDaddy'nin park sayfası kayıtları varsa (`A @`, `CNAME www`) silin.
2. Cloudflare size iki nameserver verir (ör. `xxx.ns.cloudflare.com`).
3. GoDaddy → **My Products → kiqronetwork.com → DNS → Nameservers → Change → I'll use my own nameservers** → Cloudflare'in iki adresini girin, kaydedin.
4. Cloudflare'de alan adının durumu **Active** olana kadar bekleyin (genelde 15 dk – birkaç saat; Cloudflare e-posta gönderir).
5. Cloudflare → **SSL/TLS → Overview** → **Full (strict)**. **SSL/TLS → Edge Certificates** → **Always Use HTTPS** açık.

> GoDaddy'de alan adının otomatik yenilemesini açık tutun ve **Domain Privacy / Lock** açık kalsın; DNS'i taşımak alan adının GoDaddy'de kayıtlı olmasını değiştirmez.

## 1. Render hesabı ve GitHub bağlantısı

1. https://render.com adresinde hesap açın; geçiş dönemi kararı gereği **Kiqro Inc.** adına ve şirket kartıyla.
2. Render'da **Account Settings → GitHub** bölümünden GitHub hesabınızı bağlayın. Erişimi yalnızca `dmrmurat112/kiqro-network` deposuyla sınırlayın.
3. Ekip arkadaşlarını **Workspace → Members** bölümünden ekleyin.

## 2. Blueprint ile servisleri oluşturma

1. Render'da **New → Blueprint** seçin.
2. `kiqro-network` deposunu seçin. Render `render.yaml` dosyasını okuyup 4 servis ve 1 veritabanı listeler.
3. Gizli değerler sorulacak:
   - `SENDGRID_API_KEY`: SendGrid'den yalnızca **Mail Send** yetkili yeni bir anahtar (bölüm 7). Hazır değilse boş bırakın; o durumda e-postalar gönderilmez, worker günlüğüne yazılır.
   - `PROXYCHECK_API_KEY`: proxycheck.io anahtarı (Dashboard → API Key). Yoksa boş bırakın; o durumda VPN/veri merkezi tespiti kapalı kalır.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: bölüm 8. Hazır değilse boş bırakın; panelde kartla ödeme "kullanılamıyor" görünür.
4. **Apply** deyin. Render veritabanını oluşturur, imajları derler, veritabanı geçişlerini (migration) çalıştırır ve servisleri başlatır. İlk derleme 10–15 dakika sürebilir.
5. `ORIGIN_SECRET` değeri Render tarafından otomatik üretilir. **Env Groups → kiqro-staging** bölümünden değeri kopyalayın; 4. adımda Cloudflare'e girilecek.

**Otomatik dağıtım:** Bundan sonra `main` dalına her gönderimde GitHub Actions testleri çalışır. Testler geçerse Render otomatik dağıtır (`autoDeployTrigger: checksPass`). Testler kalırsa dağıtım yapılmaz.

## 3. Cloudflare DNS

Cloudflare'de `kiqronetwork.com` → **DNS → Records**:

| Tür | Ad | Hedef | Proxy |
|---|---|---|---|
| CNAME | `track-staging` | `kiqro-staging-track.onrender.com` | önce **DNS only** (gri) |
| CNAME | `staging` | `kiqro-staging-advertise.onrender.com` | önce **DNS only** (gri) |
| CNAME | `admin-staging` | `kiqro-staging-admin.onrender.com` | önce **DNS only** (gri) |

Hedef adları Render'daki her servisin sayfasında görünür. Farklıysa oradakini kullanın.

1. Render'da her servisin **Settings → Custom Domains** bölümünde alan adının **Verified** ve sertifikanın **Issued** olmasını bekleyin. Genellikle birkaç dakika sürer.
2. Sertifikalar çıktıktan sonra üç kaydı da **Proxied** (turuncu bulut) yapın.
3. **SSL/TLS → Overview** bölümünde modu **Full (strict)** yapın.

> Takip servisi kullanıcının ülkesini Cloudflare'in `CF-IPCountry` başlığından okur. `track-staging` kaydı **mutlaka Proxied** olmalı.

## 4. Takip servisini Cloudflare arkasına kilitleme

Bu adım, Cloudflare'i atlayıp doğrudan Render adresine istek atan birinin sahte ülke ya da IP başlığı gönderememesi içindir.

1. Cloudflare → **Rules → Transform Rules → Modify Request Header → Create rule**.
2. Ad: `Kiqro origin auth (staging)`.
3. Koşul: **Hostname** *equals* `track-staging.kiqronetwork.com`.
4. İşlem: **Set static** → başlık adı `X-Origin-Auth`, değer: Render'dan kopyaladığınız `ORIGIN_SECRET`.
5. Kaydedin.

**Kontrol:**
- `https://track-staging.kiqronetwork.com/health` → `{"ok":true}`
- `https://kiqro-staging-track.onrender.com/v1/offers` → `{"error":"forbidden"}`. Bu beklenen sonuç: Cloudflare'i atlayan istekler reddediliyor.

## 5. Admin paneline erişimi kısıtlama (önerilir)

Admin panelinde zaten parola ve zorunlu 2FA var. Ek bir kat olarak paneli yalnızca ekip e-postalarına açın:

1. Cloudflare → **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Alan adı: `admin-staging.kiqronetwork.com`.
3. Politika: **Allow**, kural *Emails* → ekip adresleri (ör. `koray@kiqro.com`).
4. Kaydedin. Panele girmeden önce Cloudflare, e-postanıza tek kullanımlık bir kod gönderir. 50 kullanıcıya kadar ücretsizdir.

## 6. İlk admin kullanıcısı

1. Render → `kiqro-staging-track` → **Shell**.
2. Şunu çalıştırın:
   ```
   node_modules/.bin/tsx apps/admin/scripts/create-admin.ts koray@kiqro.com "Koray" admin
   ```
3. Ekranda bir kez gösterilen parolayı kaydedin.
4. `https://admin-staging.kiqronetwork.com` adresinden giriş yapın; ilk girişte 2FA kurulumu istenir.

Diğer ekip üyeleri için aynı komutu kendi e-postalarıyla çalıştırın. Roller: `admin`, `operator`, `finance`, `viewer`.

## 7. SendGrid

E-postalar `noreply@kiqro.com` adresinden gider; bu yüzden SendGrid'de doğrulanacak alan adı **`kiqro.com`**'dur (`kiqronetwork.com` değil).

1. SendGrid → **Settings → Sender Authentication → Authenticate Your Domain** → alan adı olarak `kiqro.com` yazın; DNS sağlayıcısı olarak `kiqro.com`'un DNS'inin bulunduğu yeri seçin.
2. SendGrid'in verdiği CNAME kayıtlarını `kiqro.com`'un DNS'ine ekleyin (Cloudflare'deyse **DNS only**, gri) ve SendGrid'de **Verify** deyin. `kiqro.com`'da zaten bir SPF kaydı varsa (ör. Google Workspace) SendGrid'in otomatik güvenlik ayarı (automated security) açıkken ek SPF gerekmez.
3. `contact@kiqro.com` posta kutusunun (veya yönlendirmesinin) çalıştığından emin olun: reklamverenlerin cevapları, demo talepleri ve kampanya inceleme bildirimleri buraya gelir.
4. **Settings → API Keys** bölümünden yalnızca **Mail Send** yetkili bir anahtar oluşturup Render'da `SENDGRID_API_KEY` olarak girin.
5. Staging'de de e-postalar gerçekten gönderilir (`SENDGRID_SANDBOX=false`); kayıt ve parola belirleme e-postaları olmadan akışlar denenemez. Gönderen adı "Kiqro Network (staging)" olduğundan canlı e-postalarla karışmaz. `true` yapılırsa SendGrid e-postayı kabul eder ama **teslim etmez**.
6. E-posta gelmiyorsa Render → **kiqro-staging-worker → Logs**'ta `SendGrid 403` (alan adı doğrulanmamış veya `MAIL_FROM` doğrulanmış alan adında değil) ya da `SendGrid 401` (API anahtarı hatalı) arayın. Spam klasörünü de kontrol edin.

## 8. Stripe (kartla bakiye yükleme)

Staging'de Stripe **test modu** kullanılır; gerçek para çekilmez.

1. Stripe Dashboard'da (Kiqro Inc. hesabı) sağ üstten **Test mode**'u açın.
2. **Developers → API keys** → *Secret key* (`sk_test_…`) değerini Render'da `STRIPE_SECRET_KEY` olarak girin.
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://staging.kiqronetwork.com/api/stripe/webhook`
   - Olaylar: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`
4. Endpoint'in **Signing secret** değerini (`whsec_…`) Render'da `STRIPE_WEBHOOK_SECRET` olarak girin.
5. Test: reklamveren panelinde **Ödemeler → Bakiye yükle**, kart `4242 4242 4242 4242`, ileri bir tarih ve herhangi bir CVC. Birkaç saniye içinde bakiye artar ve ödeme geçmişinde "Ödendi" görünür.

Canlı ortamda aynı adımlar **live** anahtarlarla ve `https://kiqronetwork.com/api/stripe/webhook` adresiyle yapılır. Stripe **Settings → Customer emails** bölümünden "Successful payments" makbuzlarını açabilirsiniz.

## 9. Kiqro uygulaması (yazılım firması) için hazırlık

1. Admin panelinde **Yayıncılar → Yeni yayıncı**: "Kiqro App (staging)".
2. **Yeni placement** oluşturun:
   - Sanal para adı: `Puan`
   - Puan kuru: uygulamadaki gerçek kurla aynı (ör. 1000)
   - Gelir payı: %70 (staging için örnek)
   - Postback URL: firmanın **staging** uç noktası (entegrasyon kılavuzu bölüm 6)
3. Firmaya güvenli bir kanaldan iletin:
   - `TRACK` adresi: `https://track-staging.kiqronetwork.com`
   - `app_key` ve `secret`
   - Entegrasyon kılavuzu (`docs/kiqro-direct-entegrasyon.pdf`)
4. Test reklamvereni ve test kampanyası oluşturun. Firma, kılavuzdaki test planını bu kampanyayla yürütür.

## 10. Günlük işletim

- **Günlükler:** Render → servis → **Logs**.
- **Geri dönüş:** Render → servis → **Events → Rollback**. Veritabanı geçişleri yalnızca ileri gider; şema değiştiren bir dağıtımı geri almadan önce geçişin eski kodla uyumlu olduğundan emin olun.
- **Yedek:** Render Postgres günlük yedek alır. Staging'de veri kaybı kritik değildir.
- **2FA sıfırlama** (telefon kaybı):
  ```
  node_modules/.bin/tsx apps/admin/scripts/reset-2fa.ts eposta@kiqro.com
  ```
  Render Shell'den çalıştırılır.

## 11. Canlı ortam

Ayrı Blueprint (`render.production.yaml`) ve ayrı veritabanıyla kurulur; adımlar [canli-ortam-kurulumu.md](canli-ortam-kurulumu.md) dosyasında.
