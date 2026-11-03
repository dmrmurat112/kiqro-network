import { ENTITY } from './entity';
import { PUBLISHED, type LocalizedDoc } from './types';

export const dpa: LocalizedDoc = {
  en: {
    slug: 'dpa',
    title: 'Data Protection Addendum',
    summary: 'The parties’ roles and obligations for personal data exchanged when running campaigns.',
    ...PUBLISHED,
    sections: [
      {
        id: 'scope',
        title: '1. Scope',
        blocks: [
          `This Addendum forms part of the Advertiser Terms between ${ENTITY.name} (“Kiqro”) and the Advertiser and applies to personal data exchanged in connection with campaigns on Kiqro Network.`,
        ],
      },
      {
        id: 'roles',
        title: '2. Roles of the parties',
        blocks: [
          'Kiqro decides how users of the Kiqro app and of publisher apps are rewarded and screened for fraud; the Advertiser decides how users of its own product are measured. The parties therefore act as independent controllers, each responsible for its own processing, and not as joint controllers or as controller and processor.',
          'The Advertiser’s MMP acts on the Advertiser’s behalf. Data that the MMP sends to Kiqro in Postbacks is received by Kiqro as an independent controller.',
        ],
      },
      {
        id: 'data',
        title: '3. Data exchanged',
        blocks: [
          {
            table: {
              head: ['Direction', 'Data', 'Purpose'],
              rows: [
                ['Kiqro → Advertiser’s MMP (in the click)', 'Click ID, campaign and source IDs, country; device advertising ID only where the user consented', 'Attribution of installs and events to Kiqro'],
                ['Advertiser’s MMP → Kiqro (Postback)', 'Click ID, event name and time, optional revenue, country, device advertising ID if configured', 'Crediting users, billing, fraud prevention'],
                ['Kiqro → Advertiser (panel/CSV)', 'Conversion and click IDs, event, country, status, price', 'Reporting and reconciliation'],
              ],
            },
          },
          'No names, e-mail addresses, phone numbers or other directly identifying data are exchanged. Special categories of data must not be sent in Postbacks.',
        ],
      },
      {
        id: 'obligations',
        title: '4. Obligations of each party',
        blocks: [
          {
            list: [
              'Each party has a legal basis for its own processing and gives users the information required by GDPR articles 13–14 and, where applicable, KVKK article 10.',
              'The Advertiser configures its MMP so that Postbacks to Kiqro contain only the data listed above.',
              'Each party implements appropriate technical and organisational measures (section 6).',
              'Each party handles data-subject requests for its own processing and forwards requests that concern the other party without delay.',
              'Each party notifies the other without undue delay, and where possible within 72 hours, of a personal data breach affecting data exchanged under this Addendum.',
            ],
          },
        ],
      },
      {
        id: 'transfers',
        title: '5. International transfers',
        blocks: ['Where data exchanged under this Addendum is transferred outside the EU/EEA, the transferring party ensures an adequacy decision or the Standard Contractual Clauses (controller-to-controller module) apply.'],
      },
      {
        id: 'security',
        title: '6. Kiqro’s security measures',
        blocks: [
          {
            list: [
              'Hosting in the EU (Frankfurt, Germany); encryption in transit (TLS) and at rest.',
              'Signed click URLs and optionally signed Postbacks (HMAC-SHA256); IP and device screening against fraud.',
              'Role-based admin access with mandatory two-factor authentication and an append-only audit log.',
              'Raw Postbacks retained for dispute resolution for up to 24 months, clicks for 13 months; then deleted.',
              'Backups with point-in-time recovery; regular dependency and security updates.',
            ],
          },
        ],
      },
      {
        id: 'term',
        title: '7. Term',
        blocks: ['This Addendum applies as long as data is exchanged under the Terms and survives termination for data still held by either party. If the English and Turkish versions differ, the English version prevails.'],
      },
    ],
  },

  tr: {
    slug: 'dpa',
    title: 'Veri Koruma Eki',
    summary: 'Kampanyalar yürütülürken paylaşılan kişisel verilere ilişkin tarafların rolleri ve yükümlülükleri.',
    ...PUBLISHED,
    sections: [
      {
        id: 'scope',
        title: '1. Kapsam',
        blocks: [
          `Bu Ek, ${ENTITY.name} (“Kiqro”) ile Reklamveren arasındaki Reklamveren Hizmet Koşulları’nın bir parçasıdır ve Kiqro Network’teki kampanyalarla bağlantılı olarak paylaşılan kişisel verilere uygulanır.`,
        ],
      },
      {
        id: 'roles',
        title: '2. Tarafların rolleri',
        blocks: [
          'Kiqro uygulamasının ve yayıncı uygulamalarının kullanıcılarının nasıl ödüllendirileceğine ve fraud’a karşı nasıl taranacağına Kiqro; kendi ürününün kullanıcılarının nasıl ölçüleceğine ise Reklamveren karar verir. Bu nedenle taraflar, müşterek veri sorumlusu ya da veri sorumlusu–veri işleyen olarak değil, her biri kendi işlemesinden sorumlu bağımsız veri sorumluları olarak hareket eder.',
          'Reklamveren’in MMP’si Reklamveren adına hareket eder. MMP’nin Postback’lerle Kiqro’ya gönderdiği veriler, Kiqro tarafından bağımsız veri sorumlusu sıfatıyla alınır.',
        ],
      },
      {
        id: 'data',
        title: '3. Paylaşılan veriler',
        blocks: [
          {
            table: {
              head: ['Yön', 'Veri', 'Amaç'],
              rows: [
                ['Kiqro → Reklamveren’in MMP’si (tıklamada)', 'Click ID, kampanya ve kaynak kimlikleri, ülke; cihaz reklam kimliği yalnızca kullanıcı onay verdiyse', 'Kurulum ve olayların Kiqro’ya atfedilmesi'],
                ['Reklamveren’in MMP’si → Kiqro (Postback)', 'Click ID, olay adı ve zamanı, isteğe bağlı gelir, ülke, yapılandırıldıysa cihaz reklam kimliği', 'Kullanıcıların ödüllendirilmesi, faturalandırma, fraud önleme'],
                ['Kiqro → Reklamveren (panel/CSV)', 'Dönüşüm ve click ID’leri, olay, ülke, durum, fiyat', 'Raporlama ve mutabakat'],
              ],
            },
          },
          'Ad, e-posta adresi, telefon numarası veya doğrudan kimlik belirleyici başka hiçbir veri paylaşılmaz. Özel nitelikli kişisel veriler Postback’lerle gönderilmemelidir.',
        ],
      },
      {
        id: 'obligations',
        title: '4. Tarafların yükümlülükleri',
        blocks: [
          {
            list: [
              'Her taraf kendi işlemesi için bir hukuki sebebe sahiptir ve kullanıcılara GDPR’ın 13–14. maddelerinin ve, uygulanabildiği ölçüde, KVKK’nın 10. maddesinin gerektirdiği bilgileri verir.',
              'Reklamveren, MMP’sini Kiqro’ya giden Postback’ler yalnızca yukarıda listelenen verileri içerecek şekilde yapılandırır.',
              'Her taraf uygun teknik ve idari tedbirleri alır (6. madde).',
              'Her taraf kendi işlemesine ilişkin ilgili kişi başvurularını ele alır ve diğer tarafı ilgilendiren başvuruları gecikmeksizin iletir.',
              'Her taraf, bu Ek kapsamında paylaşılan verileri etkileyen bir kişisel veri ihlalini diğer tarafa gecikmeksizin ve mümkünse 72 saat içinde bildirir.',
            ],
          },
        ],
      },
      {
        id: 'transfers',
        title: '5. Yurt dışına aktarım',
        blocks: ['Bu Ek kapsamında paylaşılan veriler AB/AEA dışına aktarıldığında, aktaran taraf bir yeterlilik kararının veya Standart Sözleşme Maddeleri’nin (veri sorumlusundan veri sorumlusuna modülü) uygulanmasını sağlar.'],
      },
      {
        id: 'security',
        title: '6. Kiqro’nun güvenlik tedbirleri',
        blocks: [
          {
            list: [
              'AB’de (Frankfurt, Almanya) barındırma; aktarım sırasında (TLS) ve depolamada şifreleme.',
              'İmzalı tıklama URL’leri ve isteğe bağlı imzalı Postback’ler (HMAC-SHA256); fraud’a karşı IP ve cihaz taraması.',
              'Zorunlu iki faktörlü doğrulamalı, role dayalı yönetici erişimi ve yalnızca ekleme yapılabilen işlem kaydı.',
              'Ham Postback’ler itirazların çözümü için en fazla 24 ay, tıklamalar 13 ay saklanır; ardından silinir.',
              'Belirli bir ana geri dönülebilen yedekler; düzenli bağımlılık ve güvenlik güncellemeleri.',
            ],
          },
        ],
      },
      {
        id: 'term',
        title: '7. Süre',
        blocks: ['Bu Ek, Koşullar kapsamında veri paylaşıldığı sürece uygulanır ve sözleşme sona erdikten sonra da taraflardan birinin elinde bulunan veriler için geçerliliğini korur. İngilizce ve Türkçe metinler arasında farklılık olması halinde İngilizce metin geçerlidir.'],
      },
    ],
  },
};
