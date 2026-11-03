import { ENTITY } from './entity';
import { PUBLISHED, type LocalizedDoc } from './types';

export const adPolicy: LocalizedDoc = {
  en: {
    slug: 'ad-policy',
    title: 'Advertising Content Policy',
    summary: 'What may and may not be promoted on Kiqro Network, and the rules for offer tasks.',
    ...PUBLISHED,
    sections: [
      {
        id: 'principles',
        title: '1. Principles',
        blocks: [
          'Offers on Kiqro Network reach rewarded users in many countries, including young adults. Every offer must be honest about what the user has to do, achievable in the time given, and legal in each targeted country. Kiqro reviews every campaign before it goes live and may refuse any offer.',
          'Only users aged 18 or over are eligible to complete offers on Kiqro Network.',
        ],
      },
      {
        id: 'prohibited',
        title: '2. Prohibited',
        blocks: [
          {
            list: [
              'Adult or sexual content and services.',
              'Illegal products and services, or content that promotes illegal activity.',
              'Gambling without a valid licence for every targeted country.',
              'Fake, misleading or copycat apps; malware, spyware or apps that harvest data.',
              'Pyramid schemes, multi-level marketing and “get rich” or crypto earning schemes.',
              'Offers whose main purpose is to collect personal data.',
              'Apps directed at children, or rated for children in the app stores.',
              'Hate, violence, weapons and dangerous goods.',
            ],
          },
        ],
      },
      {
        id: 'restricted',
        title: '3. Restricted — allowed with documents and approval',
        blocks: [
          {
            table: {
              head: ['Category', 'What we need'],
              rows: [
                ['Licensed gambling and betting', 'Licence for each targeted country; age gating in the product'],
                ['Credit, loans, investment and trading', 'Authorisation from the competent financial regulator; clear risk warnings'],
                ['Crypto-asset services', 'Registration or licence (e.g. under MiCA in the EU) for each targeted country'],
                ['Alcohol', 'Compliance with local advertising rules; age gating'],
                ['Health, pharmaceuticals and supplements', 'Proof of legal sale; no medical claims without evidence'],
                ['Dating', 'Age verification; no sexualised creatives'],
              ],
            },
          },
        ],
      },
      {
        id: 'tasks',
        title: '4. Rules for offer tasks',
        blocks: [
          {
            list: [
              'No task may require rating, reviewing or recommending an app or product. App stores prohibit incentivized ratings, and we never accept them.',
              'No task may require the user to provide personal data beyond what normal use of the product requires.',
              'Payment or deposit tasks must state the amount and must not require more than the product’s normal minimum.',
              'Time limits must be realistic for an ordinary user; we may ask for data showing how many users reach each milestone.',
              'Task names and instructions shown to users must match the MMP events exactly in meaning — no hidden conditions.',
              'Offers must state if users who installed the app before are not eligible.',
            ],
          },
        ],
      },
      {
        id: 'stores',
        title: '5. App store and platform rules',
        blocks: [
          'Offers must comply with the policies of Google Play, the Apple App Store and any other platform involved. Where a store removes your app, campaigns for it are paused automatically.',
        ],
      },
      {
        id: 'enforcement',
        title: '6. Enforcement',
        blocks: [
          `Kiqro may reject or pause offers that break this policy, ask for changes, and in serious or repeated cases terminate the advertiser relationship. Questions or reports: ${ENTITY.salesEmail}.`,
        ],
      },
    ],
  },

  tr: {
    slug: 'ad-policy',
    title: 'Reklam İçerik Politikası',
    summary: 'Kiqro Network’te nelerin tanıtılabileceği, nelerin tanıtılamayacağı ve teklif görevlerine ilişkin kurallar.',
    ...PUBLISHED,
    sections: [
      {
        id: 'principles',
        title: '1. İlkeler',
        blocks: [
          'Kiqro Network’teki teklifler, genç yetişkinler dahil birçok ülkedeki ödüllü kullanıcılara ulaşır. Her teklif, kullanıcının ne yapması gerektiği konusunda dürüst olmalı, verilen sürede tamamlanabilir olmalı ve hedeflenen her ülkede hukuka uygun olmalıdır. Kiqro her kampanyayı yayına almadan önce inceler ve herhangi bir teklifi reddedebilir.',
          'Kiqro Network’te teklifleri yalnızca 18 yaşını doldurmuş kullanıcılar tamamlayabilir.',
        ],
      },
      {
        id: 'prohibited',
        title: '2. Yasak olanlar',
        blocks: [
          {
            list: [
              'Yetişkin veya cinsel içerik ve hizmetler.',
              'Yasa dışı ürün ve hizmetler ya da yasa dışı faaliyetleri teşvik eden içerikler.',
              'Hedeflenen her ülke için geçerli lisansı bulunmayan şans oyunları.',
              'Sahte, yanıltıcı veya taklit uygulamalar; kötü amaçlı yazılımlar, casus yazılımlar veya veri toplayan uygulamalar.',
              'Saadet zinciri (piramit) sistemleri, çok katlı pazarlama ve “hızlı zengin ol” ya da kripto kazanç planları.',
              'Asıl amacı kişisel veri toplamak olan teklifler.',
              'Çocuklara yönelik veya uygulama mağazalarında çocuklar için derecelendirilmiş uygulamalar.',
              'Nefret, şiddet, silahlar ve tehlikeli ürünler.',
            ],
          },
        ],
      },
      {
        id: 'restricted',
        title: '3. Kısıtlı — belge ve onayla izin verilenler',
        blocks: [
          {
            table: {
              head: ['Kategori', 'İstenenler'],
              rows: [
                ['Lisanslı şans oyunları ve bahis', 'Hedeflenen her ülke için lisans; üründe yaş doğrulaması'],
                ['Kredi, borç verme, yatırım ve alım-satım', 'Yetkili finansal düzenleyiciden izin; açık risk uyarıları'],
                ['Kripto varlık hizmetleri', 'Hedeflenen her ülke için kayıt veya lisans (örneğin AB’de MiCA kapsamında)'],
                ['Alkol', 'Yerel reklam kurallarına uyum; yaş doğrulaması'],
                ['Sağlık, ilaç ve takviyeler', 'Yasal satışa ilişkin kanıt; kanıtlanmamış tıbbi iddia içermemesi'],
                ['Arkadaşlık / tanışma', 'Yaş doğrulaması; cinsel çağrışımlı görsel kullanılmaması'],
              ],
            },
          },
        ],
      },
      {
        id: 'tasks',
        title: '4. Teklif görevlerine ilişkin kurallar',
        blocks: [
          {
            list: [
              'Hiçbir görev bir uygulamayı veya ürünü puanlamayı, yorumlamayı ya da tavsiye etmeyi gerektiremez. Uygulama mağazaları ödüllü puanlamayı yasaklar ve biz bunu hiçbir zaman kabul etmeyiz.',
              'Hiçbir görev, kullanıcının ürünün olağan kullanımının gerektirdiğinden fazla kişisel veri vermesini gerektiremez.',
              'Ödeme veya yatırım görevlerinde tutar belirtilmeli ve ürünün olağan asgari tutarından fazlası istenmemelidir.',
              'Süre sınırları sıradan bir kullanıcı için gerçekçi olmalıdır; her aşamaya kaç kullanıcının ulaştığını gösteren veriler isteyebiliriz.',
              'Kullanıcılara gösterilen görev adları ve talimatlar, anlam bakımından MMP olaylarıyla birebir örtüşmelidir — gizli koşul olamaz.',
              'Uygulamayı daha önce yüklemiş kullanıcılar uygun değilse, bu teklifte belirtilmelidir.',
            ],
          },
        ],
      },
      {
        id: 'stores',
        title: '5. Uygulama mağazası ve platform kuralları',
        blocks: [
          'Teklifler Google Play, Apple App Store ve ilgili diğer tüm platformların politikalarına uymalıdır. Bir mağaza uygulamanızı kaldırırsa, o uygulamaya ait kampanyalar otomatik olarak duraklatılır.',
        ],
      },
      {
        id: 'enforcement',
        title: '6. Uygulama ve yaptırımlar',
        blocks: [
          `Kiqro, bu politikayı ihlal eden teklifleri reddedebilir veya duraklatabilir, değişiklik isteyebilir ve ciddi ya da tekrarlanan durumlarda reklamveren ilişkisini sona erdirebilir. Sorular veya bildirimler için: ${ENTITY.salesEmail}.`,
        ],
      },
    ],
  },
};
