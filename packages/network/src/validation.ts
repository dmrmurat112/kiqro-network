import type { ZodError } from 'zod';

export type UiLocale = 'en' | 'tr';

/**
 * Validation messages as keys, translated per audience: the admin panel shows Turkish,
 * the advertiser panel the user's language. A key may carry a parameter after "|",
 * e.g. "uncovered_countries|SE, NO".
 */
const MESSAGES: Record<string, Record<UiLocale, (param: string) => string>> = {
  country_code: { en: () => 'must be a two-letter country code', tr: () => 'iki harfli ülke kodu olmalı' },
  amount: { en: () => 'must be an amount such as 12.50', tr: () => 'geçerli bir tutar olmalı (ör. 12.50)' },
  date: { en: () => 'must be a valid date', tr: () => 'geçerli bir tarih olmalı' },
  product_required: { en: () => 'choose an app', tr: () => 'ürün seçilmeli' },
  name_short: { en: () => 'at least 2 characters', tr: () => 'en az 2 karakter' },
  url_invalid: { en: () => 'must be a valid URL', tr: () => 'geçerli bir URL olmalı' },
  url_https: { en: () => 'must start with https://', tr: () => 'https:// ile başlamalı' },
  color: { en: () => 'must be a colour like #6c57f0', tr: () => '#6c57f0 gibi bir renk olmalı' },
  tracking_click_id: { en: () => 'the tracking link must contain the {click_id} macro', tr: () => 'takip linkinde {click_id} makrosu olmalı' },
  countries_required: { en: () => 'choose at least one country', tr: () => 'en az bir ülke seçilmeli' },
  title_en_required: { en: () => 'an English offer title is required', tr: () => 'İngilizce başlık gerekli' },
  event_required: { en: () => 'the MMP event name is required', tr: () => 'MMP olay adı gerekli' },
  task_name_required: { en: () => 'an English task name is required', tr: () => 'İngilizce görev adı gerekli' },
  prices_required: { en: () => 'add at least one price', tr: () => 'en az bir fiyat gerekli' },
  tasks_required: { en: () => 'add at least one event', tr: () => 'en az bir görev gerekli' },
  duplicate_event: { en: () => 'the same MMP event cannot be used twice', tr: () => 'aynı MMP olayı iki kez kullanılamaz' },
  duplicate_country: { en: () => 'a country cannot be priced twice', tr: () => 'aynı ülke iki kez fiyatlanamaz' },
  uncovered_countries: {
    en: (c) => `add a default (*) price or a price for: ${c}`,
    tr: (c) => `varsayılan (*) fiyat ya da şu ülkeler için fiyat gerekli: ${c}`,
  },
  end_before_start: { en: () => 'the end must be after the start', tr: () => 'bitiş başlangıçtan sonra olmalı' },
  daily_over_total: { en: () => 'the daily budget cannot exceed the total budget', tr: () => 'günlük bütçe toplam bütçeyi aşamaz' },
  store_id_required: { en: () => 'package name, App Store ID or domain is required', tr: () => 'paket adı, App Store ID veya alan adı gerekli' },
  not_found: { en: () => 'campaign not found', tr: () => 'kampanya bulunamadı' },
  not_editable: { en: () => 'only draft campaigns can be edited; contact Kiqro to change a live campaign', tr: () => 'yalnızca taslak kampanyalar düzenlenebilir; yayındaki kampanya için Kiqro ile iletişime geçin' },
  not_submittable: { en: () => 'only draft campaigns can be submitted', tr: () => 'yalnızca taslak kampanyalar gönderilebilir' },
  not_pausable: { en: () => 'only live or paused campaigns can be paused or resumed', tr: () => 'yalnızca yayındaki veya duraklatılmış kampanyalar duraklatılıp devam ettirilebilir' },
  address_required: { en: () => 'enter the full billing address', tr: () => 'fatura adresinin tamamını girin' },
  vat_id_invalid: { en: () => 'enter a VAT or tax ID such as FI12345678', tr: () => 'geçerli bir vergi numarası girin (ör. FI12345678)' },
  email_invalid: { en: () => 'enter a valid e-mail address', tr: () => 'geçerli bir e-posta adresi girin' },
  team_admin_only: { en: () => 'only team admins can manage the team', tr: () => 'ekibi yalnızca ekip yöneticileri yönetebilir' },
  team_not_found: { en: () => 'team member not found', tr: () => 'ekip üyesi bulunamadı' },
  placement_admin_only: { en: () => 'only team admins can change placements', tr: () => 'placement’ları yalnızca ekip yöneticileri değiştirebilir' },
  placement_not_found: { en: () => 'placement not found', tr: () => 'placement bulunamadı' },
  placement_in_use: { en: () => 'this placement already has traffic; pause it instead of deleting', tr: () => 'bu placement trafik aldı; silmek yerine durdurun' },
  sale_multiplier: { en: () => 'must be between 1.01 and 5 (e.g. 1.5)', tr: () => '1,01 ile 5 arasında olmalı (ör. 1.5)' },
  sale_too_long: { en: () => 'a sale can last at most 31 days', tr: () => 'kampanya en fazla 31 gün sürebilir' },
  user_id_required: { en: () => 'enter a user ID', tr: () => 'kullanıcı kimliği girin' },
  postback_url_missing: { en: () => 'save a valid https postback URL first', tr: () => 'önce geçerli bir https postback adresi kaydedin' },
  team_last_admin: { en: () => 'the team needs at least one admin', tr: () => 'ekipte en az bir yönetici kalmalı' },
  team_not_self: { en: () => 'you cannot remove yourself', tr: () => 'kendinizi ekipten çıkaramazsınız' },
  email_taken: { en: () => 'this e-mail already has an account', tr: () => 'bu e-posta ile zaten bir hesap var' },
  totp_not_started: { en: () => 'start the setup again', tr: () => 'kurulumu yeniden başlatın' },
  totp_wrong_code: { en: () => 'wrong code; check that your phone’s clock is correct', tr: () => 'kod hatalı; telefonunuzun saatinin doğru olduğundan emin olun' },
  password_wrong: { en: () => 'the password is incorrect', tr: () => 'parola hatalı' },
  too_many_keys: { en: () => 'revoke an old API key first (limit 10)', tr: () => 'önce eski bir API anahtarını iptal edin (en fazla 10)' },
  too_many_endpoints: { en: () => 'remove an endpoint first (limit 5)', tr: () => 'önce bir uç noktayı kaldırın (en fazla 5)' },
  webhook_url: { en: () => 'use a public https:// address', tr: () => 'herkese açık bir https:// adresi girin' },
  webhook_events: { en: () => 'choose at least one event', tr: () => 'en az bir olay seçin' },
  app_exists: { en: () => 'this app is already in your list', tr: () => 'bu uygulama listenizde zaten var' },
  app_not_found: { en: () => 'app not found', tr: () => 'uygulama bulunamadı' },
  app_in_use: { en: () => 'this app has campaigns; it cannot be deleted', tr: () => 'bu uygulamanın kampanyaları var; silinemez' },
  app_identity_locked: {
    en: () => 'the platform and store ID cannot change once a campaign of this app has been submitted',
    tr: () => 'bu uygulamanın gönderilmiş kampanyası olduğu için platform ve mağaza ID’si değiştirilemez',
  },
  amount_cents: { en: () => 'enter an amount in dollars, such as 750 or 750.50', tr: () => 'dolar cinsinden bir tutar girin (ör. 750 veya 750.50)' },
  topup_minimum: { en: (m) => `the minimum top-up is $${m}`, tr: (m) => `en az ${m} $ yüklenebilir` },
  topup_maximum: { en: (m) => `card payments are limited to $${m}; contact Kiqro for a bank transfer`, tr: (m) => `kartla en fazla ${m} $ ödenebilir; daha yüksek tutarlar için havale bilgisi isteyin` },
  invoice_not_payable: { en: () => 'this invoice is already paid', tr: () => 'bu fatura zaten ödenmiş' },
  payments_unavailable: { en: () => 'card payments are not available right now; please try again later', tr: () => 'kartla ödeme şu anda kullanılamıyor; lütfen daha sonra tekrar deneyin' },
  budget_minimum: { en: (m) => `the total budget must be at least $${m}`, tr: (m) => `toplam bütçe en az ${m} $ olmalı` },
};

export function translateMessage(message: string, locale: UiLocale): string {
  const [key, param = ''] = message.split('|');
  return MESSAGES[key!]?.[locale](param) ?? message;
}

export interface FieldIssue {
  /** Dotted path of the field, e.g. "tasks.1.prices". Empty for form-level issues. */
  path: string;
  message: string;
}

export function localizedIssues(error: ZodError, locale: UiLocale): FieldIssue[] {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: translateMessage(i.message, locale) }));
}
