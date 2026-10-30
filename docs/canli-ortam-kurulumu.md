# Canlı ortam (production) kurulumu

Canlı ortam, test ortamıyla ([test-ortami-kurulumu.md](test-ortami-kurulumu.md)) aynı yapıdadır. Tanımı `render.production.yaml` dosyasındadır. Farklar:

| | Staging | Canlı |
|---|---|---|
| Adresler | `staging.`, `track-staging.`, `admin-staging.kiqronetwork.com` | `kiqronetwork.com` (+ `www` yönlendirmesi), `track.kiqronetwork.com`, `admin.kiqronetwork.com` |
| Dağıtılan dal | `main` | `production` |
| Takip servisi | 1 × Starter | 2 × Standard (biri yeniden başlarken diğeri çalışır) |
| Veritabanı | basic-256mb | basic-1gb, noktasal geri dönüş (PITR) |
| SendGrid | sandbox (teslim etmez) | gerçek gönderim |
| Stripe | test anahtarları | **live** anahtarlar |

Tahmini maliyet ayda yaklaşık 120–150 $'dır. Güncel fiyatlar için Render'ın fiyat sayfasına bakın.

## Ön koşullar

- Staging en az bir hafta sorunsuz çalışmış olmalı.
- Yazılım firmasının entegrasyonu staging'de test planını geçmiş olmalı.
- Gerçek bir MMP ile en az bir uçtan uca test yapılmış olmalı: gerçek kurulum, MMP postback'i, kullanıcıya ödül.
- Hukuki metinler avukat tarafından onaylanmış olmalı (bölüm 6).
- Stripe hesabı canlı ödeme almaya açılmış olmalı (şirket ve banka doğrulaması tamam).

## 1. `production` dalını oluşturma

Canlı ortam yalnızca `production` dalından dağıtılır. Böylece `main`'e giden her değişiklik önce staging'de denenir.

```bash
git push origin main:production
```

Sonraki her yayın aynı komutla yapılır. GitHub Actions bu dalda da testleri çalıştırır; testler geçmezse dağıtım yapılmaz.

> Önerilen: GitHub → Settings → Branches → `production` için koruma kuralı ekleyin (yalnızca yöneticiler gönderebilir, durum kontrolleri zorunlu).

## 2. Blueprint

1. Render → **New → Blueprint** → `kiqro-network` deposu.
2. **Blueprint path** alanına `render.production.yaml` yazın.
3. Gizli değerleri girin. Hepsi canlı değerler olmalı; staging değerlerini kullanmayın:
   - `SENDGRID_API_KEY`: yeni, yalnızca Mail Send yetkili anahtar
   - `IPQS_API_KEY`
   - `STRIPE_SECRET_KEY`: `sk_live_…`
   - `STRIPE_WEBHOOK_SECRET`: 5. adımda oluşur; önce boş bırakıp sonra girin
4. **Apply**. `ORIGIN_SECRET` otomatik üretilir: **Env Groups → kiqro-prod** bölümünden kopyalayın.

## 3. Cloudflare

Staging bölüm 3–5 ile aynı adımlar, canlı adlarla:

| Tür | Ad | Hedef |
|---|---|---|
| CNAME | `@` (kök, `kiqronetwork.com`) | `kiqro-prod-advertise.onrender.com` |
| CNAME | `www` | `kiqro-prod-advertise.onrender.com` |
| CNAME | `track` | `kiqro-prod-track.onrender.com` |
| CNAME | `admin` | `kiqro-prod-admin.onrender.com` |

- Kök alan adına CNAME eklenebilir; Cloudflare bunu otomatik olarak düzleştirir (CNAME flattening).
- Render'da kök alan adı (`kiqronetwork.com`) eklendiğinde `www.kiqronetwork.com` da eklenir ve köke yönlendirilir; `www` kaydı bunun için.
- Sertifikalar çıkana kadar **DNS only**, sonra **Proxied**.
- Transform Rule: `Kiqro origin auth (production)`, Hostname = `track.kiqronetwork.com`, `X-Origin-Auth` = canlı `ORIGIN_SECRET`.
- Cloudflare Access: `admin.kiqronetwork.com` yalnızca ekip e-postalarına.
- Önerilen: **Security → WAF → Rate limiting**: `track.kiqronetwork.com/c/*` için IP başına dakikada 120 istek.

## 4. İlk admin

Render → `kiqro-prod-track` → **Shell**:

```
node_modules/.bin/tsx apps/admin/scripts/create-admin.ts koray@kiqro.com "Koray" admin
```

Canlı ortamda yalnızca gereken kişilere admin hesabı açın; finans işlemleri için `finance` rolünü kullanın.

## 5. Stripe (live)

1. Stripe Dashboard → test modunu kapatın.
2. **Developers → Webhooks → Add endpoint**: `https://kiqronetwork.com/api/stripe/webhook`, olaylar staging'deki beşi.
3. Signing secret'ı Render'da `STRIPE_WEBHOOK_SECRET` olarak girin; servis kendiliğinden yeniden başlar.
4. **Settings → Customer emails → Successful payments** açık olsun (Stripe makbuzu).
5. Küçük bir gerçek ödemeyle deneyin (ör. kendi test reklamvereniniz, 500 $), ardından Stripe'tan iade edin. İade, webhook ile bakiyeden otomatik düşülür (kısmi iadeler dahil).

## 6. Hukuki metinler

Avukat onayından sonra:

1. `apps/advertise/src/content/legal/` altındaki metinleri güncelleyin, `status: 'final'` yapın ve `version` değerini artırın.
2. Render → Env Groups → `kiqro-prod` → `TERMS_REQUIRED=true`.

## 7. Yayın kontrol listesi

- [ ] `https://track.kiqronetwork.com/health` → `{"ok":true}`
- [ ] `https://kiqro-prod-track.onrender.com/v1/offers` → `{"error":"forbidden"}`
- [ ] Admin girişi ve 2FA çalışıyor
- [ ] Reklamveren daveti e-postası geliyor (SendGrid gerçek gönderim)
- [ ] Stripe ile 500 $ yükleme bakiyeye yansıyor
- [ ] Kiqro uygulamasının **canlı** placement'ı oluşturuldu; `app_key`/`secret` firmaya iletildi
- [ ] Firmanın canlı postback adresi placement'a girildi
- [ ] İlk gerçek kampanya: tıklama → kurulum → postback → kullanıcı ödülü

## 8. Günlük işletim

- **Yayın:** `git push origin main:production` (staging'de denendikten sonra).
- **Geri alma:** Render → servis → **Events → Rollback**. Veritabanı geçişleri yalnızca ileri gider; şema değiştiren bir yayını geri almadan önce eski kodun yeni şemayla çalıştığından emin olun.
- **Yedek:** Render Postgres → **Recovery**: belirli bir ana geri dönüş (PITR) yeni bir veritabanı oluşturur; uygulamayı ona yönlendirmek için `DATABASE_URL` değiştirilir.
- **İzleme:** Render → servis → **Metrics** ve **Logs**. Uyarılar için Render → **Notifications** bölümünden e-posta veya Slack bağlayın.
