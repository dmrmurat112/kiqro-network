# Test ortamı (staging) kurulumu — Render + Cloudflare

Bu belge Kiqro Network test ortamının kurulumunu adım adım anlatır. Kodla ilgili her şey depoda hazır:

- `render.yaml`: servisler, veritabanı, ortam değişkenleri
- `infra/docker/*.Dockerfile`: imajlar
- `.github/workflows/ci.yml`: otomatik testler

Aşağıdaki adımlar hesap ve erişim gerektirdiği için sizin tarafınızdan yapılır. Toplam süre yaklaşık **1–1,5 saat** (DNS ve sertifika beklemesi dahil).

## Ne kurulacak

| Servis | Render adı | Adres | Görev |
|---|---|---|---|
| Takip servisi | `kiqro-staging-track` | `https://track-staging.kiqro.com` | Offers API, tıklamalar, MMP postback'leri |
| İşçi (worker) | `kiqro-staging-worker` | — | Yayıncı postback'leri, e-postalar, bakiye uyarıları |
| Reklamveren sitesi ve paneli | `kiqro-staging-advertise` | `https://advertise-staging.kiqro.com` | Tanıtım sitesi, reklamveren paneli |
| Admin paneli | `kiqro-staging-admin` | `https://admin-staging.kiqro.com` | Kiqro ekibi |
| Veritabanı | `kiqro-staging-db` | (yalnızca iç ağ) | PostgreSQL 17 |

Hepsi Render **Frankfurt** bölgesinde çalışır. Tahmini maliyet ayda yaklaşık **35 $**: 4 × Starter servis ve küçük Postgres. Güncel fiyatlar için Render'ın fiyat sayfasına bakın.

> Alan adları tek seviyeli (`track-staging.kiqro.com`). Cloudflare'in ücretsiz sertifikası `track.staging.kiqro.com` gibi iki seviyeli adları kapsamaz.

---

## 1. Render hesabı ve GitHub bağlantısı

1. https://render.com adresinde hesap açın; geçiş dönemi kararı gereği **Kiqro Inc.** adına ve şirket kartıyla.
2. Render'da **Account Settings → GitHub** bölümünden GitHub hesabınızı bağlayın. Erişimi yalnızca `dmrmurat112/kiqro-network` deposuyla sınırlayın.
3. Ekip arkadaşlarını **Workspace → Members** bölümünden ekleyin.

## 2. Blueprint ile servisleri oluşturma

1. Render'da **New → Blueprint** seçin.
2. `kiqro-network` deposunu seçin. Render `render.yaml` dosyasını okuyup 4 servis ve 1 veritabanı listeler.
3. Gizli değerler sorulacak:
   - `SENDGRID_API_KEY`: SendGrid'den yalnızca **Mail Send** yetkili yeni bir anahtar (bölüm 7). Hazır değilse boş bırakın; o durumda e-postalar gönderilmez, worker günlüğüne yazılır.
   - `IPQS_API_KEY`: IPQualityScore anahtarı. Yoksa boş bırakın; o durumda VPN/veri merkezi tespiti kapalı kalır.
4. **Apply** deyin. Render veritabanını oluşturur, imajları derler, veritabanı geçişlerini (migration) çalıştırır ve servisleri başlatır. İlk derleme 10–15 dakika sürebilir.
5. `ORIGIN_SECRET` değeri Render tarafından otomatik üretilir. **Env Groups → kiqro-staging** bölümünden değeri kopyalayın; 4. adımda Cloudflare'e girilecek.

**Otomatik dağıtım:** Bundan sonra `main` dalına her gönderimde GitHub Actions testleri çalışır. Testler geçerse Render otomatik dağıtır (`autoDeployTrigger: checksPass`). Testler kalırsa dağıtım yapılmaz.

## 3. Cloudflare DNS

Cloudflare'de `kiqro.com` → **DNS → Records**:

| Tür | Ad | Hedef | Proxy |
|---|---|---|---|
| CNAME | `track-staging` | `kiqro-staging-track.onrender.com` | önce **DNS only** (gri) |
| CNAME | `advertise-staging` | `kiqro-staging-advertise.onrender.com` | önce **DNS only** (gri) |
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
3. Koşul: **Hostname** *equals* `track-staging.kiqro.com`.
4. İşlem: **Set static** → başlık adı `X-Origin-Auth`, değer: Render'dan kopyaladığınız `ORIGIN_SECRET`.
5. Kaydedin.

**Kontrol:**
- `https://track-staging.kiqro.com/health` → `{"ok":true}`
- `https://kiqro-staging-track.onrender.com/v1/offers` → `{"error":"forbidden"}`. Bu beklenen sonuç: Cloudflare'i atlayan istekler reddediliyor.

## 5. Admin paneline erişimi kısıtlama (önerilir)

Admin panelinde zaten parola ve zorunlu 2FA var. Ek bir kat olarak paneli yalnızca ekip e-postalarına açın:

1. Cloudflare → **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Alan adı: `admin-staging.kiqro.com`.
3. Politika: **Allow**, kural *Emails* → ekip adresleri (ör. `koray@kiqro.com`).
4. Kaydedin. Panele girmeden önce Cloudflare, e-postanıza tek kullanımlık bir kod gönderir. 50 kullanıcıya kadar ücretsizdir.

## 6. İlk admin kullanıcısı

1. Render → `kiqro-staging-track` → **Shell**.
2. Şunu çalıştırın:
   ```
   node_modules/.bin/tsx apps/admin/scripts/create-admin.ts koray@kiqro.com "Koray" admin
   ```
3. Ekranda bir kez gösterilen parolayı kaydedin.
4. `https://admin-staging.kiqro.com` adresinden giriş yapın; ilk girişte 2FA kurulumu istenir.

Diğer ekip üyeleri için aynı komutu kendi e-postalarıyla çalıştırın. Roller: `admin`, `operator`, `finance`, `viewer`.

## 7. SendGrid

1. SendGrid → **Settings → Sender Authentication → Authenticate Your Domain** → DNS sağlayıcısı olarak Cloudflare'i seçin, alan adı olarak `kiqro.com` yazın.
2. SendGrid'in verdiği CNAME kayıtlarını Cloudflare'e **DNS only** (gri) olarak ekleyin ve SendGrid'de **Verify** deyin.
3. **Settings → API Keys** bölümünden yalnızca **Mail Send** yetkili bir anahtar oluşturup Render'da `SENDGRID_API_KEY` olarak girin.
4. Staging'de `SENDGRID_SANDBOX=true` ayarlı. Bu modda SendGrid isteği doğrular ama e-postayı **teslim etmez**. Test için gerçek gönderim isterseniz Render'da bu değeri `false` yapın.

## 8. Kiqro uygulaması (yazılım firması) için hazırlık

1. Admin panelinde **Yayıncılar → Yeni yayıncı**: "Kiqro App (staging)".
2. **Yeni placement** oluşturun:
   - Sanal para adı: `Puan`
   - Puan kuru: uygulamadaki gerçek kurla aynı (ör. 1000)
   - Gelir payı: %70 (staging için örnek)
   - Postback URL: firmanın **staging** uç noktası (entegrasyon kılavuzu bölüm 6)
3. Firmaya güvenli bir kanaldan iletin:
   - `TRACK` adresi: `https://track-staging.kiqro.com`
   - `app_key` ve `secret`
   - Entegrasyon kılavuzu (`docs/kiqro-direct-entegrasyon.pdf`)
4. Test reklamvereni ve test kampanyası oluşturun. Firma, kılavuzdaki test planını bu kampanyayla yürütür.

## 9. Günlük işletim

- **Günlükler:** Render → servis → **Logs**.
- **Geri dönüş:** Render → servis → **Events → Rollback**. Veritabanı geçişleri yalnızca ileri gider; şema değiştiren bir dağıtımı geri almadan önce geçişin eski kodla uyumlu olduğundan emin olun.
- **Yedek:** Render Postgres günlük yedek alır. Staging'de veri kaybı kritik değildir.
- **2FA sıfırlama** (telefon kaybı):
  ```
  node_modules/.bin/tsx apps/admin/scripts/reset-2fa.ts eposta@kiqro.com
  ```
  Render Shell'den çalıştırılır.

## 10. Canlı ortam (sonra)

Canlı ortam aynı yapıyla, ayrı bir Blueprint ve ayrı bir veritabanıyla kurulacak:
- Adresler: `track.kiqro.com`, `advertise.kiqro.com`, `admin.kiqro.com`.
- Daha büyük planlar ve noktasal geri dönüş (PITR) destekli veritabanı.
- `SENDGRID_SANDBOX=false`.
- Hukuki metinler onaylanınca `TERMS_REQUIRED=true`.
