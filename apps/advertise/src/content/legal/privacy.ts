import { ENTITY } from './entity';
import { PUBLISHED, type LocalizedDoc } from './types';

export const privacy: LocalizedDoc = {
  en: {
    slug: 'privacy',
    title: 'Privacy Notice — kiqronetwork.com',
    summary: 'How Kiqro handles personal data of website visitors, demo requesters and advertiser panel users.',
    ...PUBLISHED,
    sections: [
      {
        id: 'scope',
        title: '1. Who we are and what this covers',
        blocks: [
          `${ENTITY.name}, ${ENTITY.addressLine} (“Kiqro”) is the controller for the personal data described here. Contact: ${ENTITY.privacyEmail}.`,
          'This notice covers the kiqronetwork.com website, the demo request form and the advertiser panel. It does not cover the Kiqro rewards app; its users are covered by the privacy policy at kiqro.com.',
        ],
      },
      {
        id: 'data',
        title: '2. Personal data we process',
        blocks: [
          {
            table: {
              head: ['Who', 'Data', 'Purpose', 'Legal basis (GDPR art. 6)'],
              rows: [
                ['Website visitors', 'IP address, browser type, requested pages (server and security logs)', 'Operating and securing the site, preventing abuse', 'Legitimate interests (6(1)(f))'],
                ['Demo requesters', 'Name, work e-mail, company, website, category, budget band, message, language, IP address', 'Answering your request and following up on a possible contract; preventing spam', 'Steps prior to a contract (6(1)(b)); legitimate interests (6(1)(f))'],
                ['Advertiser panel users', 'Name, e-mail, password hash, language and theme preference, login times and IP addresses, actions taken', 'Providing the panel, account security, audit trail, service e-mails', 'Contract with your employer (6(1)(b)/(f)); legal obligations (6(1)(c))'],
                ['Business contacts', 'Contact details and correspondence', 'Managing the commercial relationship and invoicing', 'Legitimate interests (6(1)(f)); legal obligations (6(1)(c))'],
              ],
            },
          },
          'We do not use advertising or analytics cookies on this website, and we do not sell personal data.',
        ],
      },
      {
        id: 'retention',
        title: '3. How long we keep it',
        blocks: [
          {
            list: [
              'Demo requests: up to 24 months after the last contact, unless a contract follows.',
              'Advertiser panel accounts: for the duration of the contract and up to 12 months after, then deleted or anonymised.',
              'Security and login logs: up to 13 months.',
              'Invoices and accounting records: for as long as applicable tax and accounting law requires.',
            ],
          },
        ],
      },
      {
        id: 'recipients',
        title: '4. Who receives the data',
        blocks: [
          'Our service providers (sub-processors) process data on our behalf under written agreements — see the Sub-processors page. We disclose data to authorities only when legally required.',
        ],
      },
      {
        id: 'transfers',
        title: '5. International transfers',
        blocks: [
          `Our application and database are hosted in the EU (Frankfurt, Germany). ${ENTITY.name} and some of our providers, such as our e-mail provider, are based in the United States. Transfers outside the EU/EEA rely on the EU–US Data Privacy Framework where the recipient is certified, or on the European Commission’s Standard Contractual Clauses with supplementary measures.`,
        ],
      },
      {
        id: 'rights',
        title: '6. Your rights',
        blocks: [
          `You may request access to, correction or deletion of your personal data, restriction of or objection to its processing, and data portability. Write to ${ENTITY.privacyEmail}; we answer within one month.`,
          'You may also lodge a complaint with the data protection supervisory authority of your country of residence or place of work (for example the Data Protection Ombudsman in Finland, tietosuoja.fi).',
        ],
      },
      {
        id: 'kvkk',
        title: '7. Users in Türkiye (KVKK)',
        blocks: [
          `If you are in Türkiye, ${ENTITY.name} processes your personal data as data controller under Law No. 6698 on the Protection of Personal Data (“KVKK”), for the purposes and on the grounds described above (KVKK art. 5: performance of a contract, legal obligation and legitimate interest). Data is transferred abroad (to the EU and the United States) for hosting and service provision, under the safeguards provided for in KVKK art. 9.`,
          `Under KVKK art. 11 you may ask whether your data is processed, request information about it, its purpose and recipients, its correction or deletion, and compensation for damage caused by unlawful processing. Send requests to ${ENTITY.privacyEmail}; we answer free of charge within 30 days. You may complain to the Personal Data Protection Authority (kvkk.gov.tr) if your request is refused or not answered.`,
        ],
      },
      {
        id: 'security',
        title: '8. Security',
        blocks: [
          'Passwords are stored only as salted hashes; sessions and password links are random tokens of which we store only a hash. Access to the admin systems requires two-factor authentication, and administrative actions are logged.',
        ],
      },
      {
        id: 'changes',
        title: '9. Changes',
        blocks: ['We will publish changes to this notice on this page and, for material changes, inform panel users by e-mail. If the English and Turkish versions differ, the English version prevails.'],
      },
    ],
  },

  tr: {
    slug: 'privacy',
    title: 'Gizlilik Bildirimi — kiqronetwork.com',
    summary: 'Kiqro’nun web sitesi ziyaretçilerinin, demo talep edenlerin ve reklamveren paneli kullanıcılarının kişisel verilerini nasıl işlediği.',
    ...PUBLISHED,
    sections: [
      {
        id: 'scope',
        title: '1. Biz kimiz ve bu bildirim neyi kapsar',
        blocks: [
          `Burada açıklanan kişisel veriler bakımından veri sorumlusu ${ENTITY.name}, ${ENTITY.addressLine}’dir (“Kiqro”). İletişim: ${ENTITY.privacyEmail}.`,
          'Bu bildirim kiqronetwork.com web sitesini, demo talep formunu ve reklamveren panelini kapsar. Kiqro ödül uygulamasını kapsamaz; o uygulamanın kullanıcıları kiqro.com’daki gizlilik politikasına tabidir.',
        ],
      },
      {
        id: 'data',
        title: '2. İşlediğimiz kişisel veriler',
        blocks: [
          {
            table: {
              head: ['Kim', 'Veri', 'Amaç', 'Hukuki sebep (GDPR md. 6)'],
              rows: [
                ['Web sitesi ziyaretçileri', 'IP adresi, tarayıcı türü, istenen sayfalar (sunucu ve güvenlik kayıtları)', 'Siteyi işletmek ve güvenliğini sağlamak, kötüye kullanımı önlemek', 'Meşru menfaat (6(1)(f))'],
                ['Demo talep edenler', 'Ad, iş e-postası, şirket, web sitesi, kategori, bütçe aralığı, mesaj, dil, IP adresi', 'Talebinizi yanıtlamak ve olası bir sözleşme için takip etmek; spam’i önlemek', 'Sözleşme öncesi adımlar (6(1)(b)); meşru menfaat (6(1)(f))'],
                ['Reklamveren paneli kullanıcıları', 'Ad, e-posta, parola özeti (hash), dil ve tema tercihi, giriş zamanları ve IP adresleri, yapılan işlemler', 'Paneli sunmak, hesap güvenliği, işlem kaydı, hizmet e-postaları', 'İşvereninizle yapılan sözleşme (6(1)(b)/(f)); hukuki yükümlülükler (6(1)(c))'],
                ['İş bağlantıları', 'İletişim bilgileri ve yazışmalar', 'Ticari ilişkinin yönetimi ve faturalandırma', 'Meşru menfaat (6(1)(f)); hukuki yükümlülükler (6(1)(c))'],
              ],
            },
          },
          'Bu web sitesinde reklam veya analitik çerezleri kullanmıyoruz ve kişisel verileri satmıyoruz.',
        ],
      },
      {
        id: 'retention',
        title: '3. Saklama süreleri',
        blocks: [
          {
            list: [
              'Demo talepleri: bir sözleşme kurulmadıkça son iletişimden itibaren en fazla 24 ay.',
              'Reklamveren paneli hesapları: sözleşme süresince ve sonrasında en fazla 12 ay; ardından silinir veya anonim hale getirilir.',
              'Güvenlik ve giriş kayıtları: en fazla 13 ay.',
              'Faturalar ve muhasebe kayıtları: yürürlükteki vergi ve muhasebe mevzuatının gerektirdiği süre boyunca.',
            ],
          },
        ],
      },
      {
        id: 'recipients',
        title: '4. Verilerin aktarıldığı taraflar',
        blocks: [
          'Hizmet sağlayıcılarımız (alt işleyenler) verileri yazılı sözleşmeler çerçevesinde bizim adımıza işler — Alt İşleyenler sayfasına bakınız. Verileri yalnızca kanunen zorunlu olduğunda yetkili makamlarla paylaşırız.',
        ],
      },
      {
        id: 'transfers',
        title: '5. Yurt dışına aktarım',
        blocks: [
          `Uygulamamız ve veritabanımız AB’de (Frankfurt, Almanya) barındırılmaktadır. ${ENTITY.name} ve e-posta sağlayıcımız gibi bazı sağlayıcılarımız Amerika Birleşik Devletleri’nde yerleşiktir. AB/AEA dışına aktarımlar, alıcının sertifikalı olduğu durumlarda AB–ABD Veri Gizliliği Çerçevesi’ne, aksi halde Avrupa Komisyonu’nun Standart Sözleşme Maddeleri’ne ve ek tedbirlere dayanır.`,
        ],
      },
      {
        id: 'rights',
        title: '6. Haklarınız',
        blocks: [
          `Kişisel verilerinize erişim, bunların düzeltilmesi veya silinmesi, işlenmesinin kısıtlanması veya işlenmesine itiraz ile veri taşınabilirliği talep edebilirsiniz. ${ENTITY.privacyEmail} adresine yazın; bir ay içinde yanıt veririz.`,
          'Ayrıca ikamet ettiğiniz veya çalıştığınız ülkenin veri koruma denetim makamına (örneğin Finlandiya’da Veri Koruma Ombudsmanı, tietosuoja.fi) şikâyette bulunabilirsiniz.',
        ],
      },
      {
        id: 'kvkk',
        title: '7. Türkiye’deki kullanıcılar (KVKK)',
        blocks: [
          `Türkiye’de bulunuyorsanız ${ENTITY.name}, kişisel verilerinizi 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamında veri sorumlusu sıfatıyla, yukarıda açıklanan amaçlarla ve hukuki sebeplere (KVKK md. 5: sözleşmenin ifası, hukuki yükümlülük ve meşru menfaat) dayanarak işler. Veriler, barındırma ve hizmet sunumu amacıyla, KVKK md. 9’da öngörülen güvencelerle yurt dışına (AB ve Amerika Birleşik Devletleri) aktarılır.`,
          `KVKK md. 11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, bunlara, işlenme amacına ve aktarıldığı kişilere ilişkin bilgi talep etme, düzeltilmesini veya silinmesini isteme ve hukuka aykırı işleme nedeniyle uğradığınız zararın giderilmesini talep etme haklarına sahipsiniz. Taleplerinizi ${ENTITY.privacyEmail} adresine gönderebilirsiniz; 30 gün içinde ücretsiz olarak yanıt veririz. Talebiniz reddedilir veya yanıtlanmazsa Kişisel Verileri Koruma Kurumu’na (kvkk.gov.tr) şikâyette bulunabilirsiniz.`,
        ],
      },
      {
        id: 'security',
        title: '8. Güvenlik',
        blocks: [
          'Parolalar yalnızca tuzlanmış özet (salted hash) olarak saklanır; oturumlar ve parola bağlantıları, yalnızca özetini sakladığımız rastgele anahtarlardır. Yönetim sistemlerine erişim iki faktörlü doğrulama gerektirir ve yönetimsel işlemler kayıt altına alınır.',
        ],
      },
      {
        id: 'changes',
        title: '9. Değişiklikler',
        blocks: ['Bu bildirimdeki değişiklikleri bu sayfada yayınlarız; önemli değişiklikleri panel kullanıcılarına e-postayla bildiririz. İngilizce ve Türkçe metinler arasında farklılık olması halinde İngilizce metin geçerlidir.'],
      },
    ],
  },
};
