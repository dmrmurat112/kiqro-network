import { PUBLISHED, type LocalizedDoc } from './types';

export const subprocessors: LocalizedDoc = {
  en: {
    slug: 'subprocessors',
    title: 'Sub-processors',
    summary: 'Service providers that process personal data on Kiqro Network’s behalf.',
    ...PUBLISHED,
    sections: [
      {
        id: 'list',
        title: 'Current sub-processors',
        blocks: [
          {
            table: {
              head: ['Provider', 'Purpose', 'Location of processing', 'Transfer safeguard'],
              rows: [
                ['Render Services, Inc.', 'Application and database hosting', 'EU (Frankfurt, Germany)', 'Standard Contractual Clauses'],
                ['Cloudflare, Inc.', 'DNS, TLS, DDoS and bot protection, visitor country', 'Global edge network', 'EU–US DPF / SCCs'],
                ['Twilio Inc. (SendGrid)', 'Transactional e-mail (invitations, password resets, alerts)', 'United States', 'EU–US DPF / SCCs'],
                ['proxycheck.io', 'IP reputation checks for fraud prevention (IP address only)', 'Provider’s servers, as described in its privacy policy', 'SCCs where required'],
              ],
            },
          },
          'Card top-ups in the panel are processed by Stripe, which acts as an independent controller for payment data under its own privacy policy.',
          'We will update this page at least 30 days before adding a sub-processor that processes advertiser panel data, so customers can object.',
        ],
      },
    ],
  },

  tr: {
    slug: 'subprocessors',
    title: 'Alt İşleyenler',
    summary: 'Kiqro Network adına kişisel veri işleyen hizmet sağlayıcılar.',
    ...PUBLISHED,
    sections: [
      {
        id: 'list',
        title: 'Güncel alt işleyenler',
        blocks: [
          {
            table: {
              head: ['Sağlayıcı', 'Amaç', 'İşleme yeri', 'Aktarım güvencesi'],
              rows: [
                ['Render Services, Inc.', 'Uygulama ve veritabanı barındırma', 'AB (Frankfurt, Almanya)', 'Standart Sözleşme Maddeleri'],
                ['Cloudflare, Inc.', 'DNS, TLS, DDoS ve bot koruması, ziyaretçi ülkesi', 'Küresel uç ağı', 'AB–ABD DPF / SSM'],
                ['Twilio Inc. (SendGrid)', 'İşlemsel e-posta (davetler, parola sıfırlama, uyarılar)', 'Amerika Birleşik Devletleri', 'AB–ABD DPF / SSM'],
                ['proxycheck.io', 'Fraud önleme için IP itibar kontrolü (yalnızca IP adresi)', 'Sağlayıcının gizlilik politikasında belirtilen sunucuları', 'Gerektiğinde SSM'],
              ],
            },
          },
          'Paneldeki kartla bakiye yüklemeleri, ödeme verileri bakımından kendi gizlilik politikası çerçevesinde bağımsız veri sorumlusu olarak hareket eden Stripe tarafından işlenir.',
          'Reklamveren paneli verilerini işleyen yeni bir alt işleyen eklemeden en az 30 gün önce bu sayfayı güncelleriz; böylece müşteriler itiraz edebilir. (SSM: Standart Sözleşme Maddeleri; DPF: AB–ABD Veri Gizliliği Çerçevesi.)',
        ],
      },
    ],
  },
};
