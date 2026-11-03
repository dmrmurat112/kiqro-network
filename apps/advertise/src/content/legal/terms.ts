import { ENTITY } from './entity';
import { PUBLISHED, type LocalizedDoc } from './types';

const SUCCESSOR = { en: 'Kiqro Oy (Finland), once incorporated', tr: 'kurulduğunda Kiqro Oy’ye (Finlandiya)' };

export const terms: LocalizedDoc = {
  en: {
    slug: 'terms',
    title: 'Advertiser Terms of Service',
    summary: 'The agreement between Kiqro and advertisers that buy verified events on Kiqro Network.',
    ...PUBLISHED,
    sections: [
      {
        id: 'parties',
        title: '1. Parties and scope',
        blocks: [
          `These Advertiser Terms of Service (the “Terms”) govern the use of Kiqro Network, the performance advertising network operated by ${ENTITY.name}, ${ENTITY.addressLine} (“Kiqro”, “we”), by the company that accepts them (the “Advertiser”, “you”).`,
          `Kiqro may assign these Terms to ${SUCCESSOR.en}; we will notify you in writing before doing so.`,
          'An Insertion Order (“IO”) signed by both parties may set campaign-specific prices, budgets or terms. If an IO and these Terms conflict, the IO prevails for that campaign.',
          'These Terms apply only to business customers. Kiqro Network is not offered to consumers.',
        ],
      },
      {
        id: 'definitions',
        title: '2. Definitions',
        blocks: [
          {
            list: [
              '“Event” — an install or in-app action (for example reaching a level, registration, first deposit or purchase) that you define for a campaign and price per country.',
              '“Postback” — a server-to-server notification of an Event sent to Kiqro by your mobile measurement partner (“MMP”) or your own server.',
              '“Verified Conversion” — an Event that is attributed to Kiqro by your Postback and passes Kiqro’s quality checks (section 7).',
              '“Held Conversion” — an Event that Kiqro’s quality checks hold for manual review. It is not billed unless and until it is approved.',
              '“Balance” — the prepaid amount available on your account.',
              '“Reversal Window” — the period after a Verified Conversion during which you may dispute it (30 days unless agreed otherwise in writing).',
              '“Incentivized traffic” — users who receive a reward from a publisher for completing your Events.',
            ],
          },
        ],
      },
      {
        id: 'accounts',
        title: '3. Accounts',
        blocks: [
          'Kiqro creates panel accounts for the people you nominate. You are responsible for keeping credentials confidential, for everything done with your accounts, and for telling us without delay about any suspected unauthorized access.',
          'You must keep your company and billing details accurate. We may verify your company (for example VAT number, app store developer name) before activating campaigns.',
        ],
      },
      {
        id: 'campaigns',
        title: '4. Campaigns',
        blocks: [
          'You define the product, Events, prices, countries, budgets and schedule of each campaign. Campaigns go live only after Kiqro has reviewed them and a test Postback has been received.',
          'You acknowledge that Kiqro Network delivers incentivized traffic and that users are rewarded for completing your Events. You must not use Kiqro Network if your own policies, or those of your MMP or app stores, prohibit incentivized traffic for your product.',
          'All campaigns must comply with the Advertising Content Policy. Kiqro may refuse, pause or stop any campaign that does not, or that in our reasonable opinion exposes users, publishers or Kiqro to legal or reputational risk.',
          'You may pause a campaign, lower its budget or end it at any time in coordination with Kiqro. Price reductions apply only to users who start the offer after the change.',
        ],
      },
      {
        id: 'tracking',
        title: '5. Tracking and measurement',
        blocks: [
          'Attribution is performed by your MMP. You must configure the Kiqro tracking link and Postbacks as described in the panel’s Integration page and keep them working for the life of the campaign.',
          'Kiqro’s records of Postbacks received and Verified Conversions are the basis for billing. If they differ from your MMP data by more than 5% for a calendar month, either party may request a reconciliation using the click IDs in the conversion log; both parties will cooperate in good faith to resolve the difference within 30 days.',
          'Events whose Postback arrives after the time limit you set for that Event, or that are not attributed to a Kiqro click, are not billed.',
        ],
      },
      {
        id: 'billing',
        title: '6. Prices, prepayment and billing',
        blocks: [
          'Campaigns are prepaid. The minimum top-up is USD 500 unless agreed otherwise. Top-ups are made by card through Stripe in the panel or by bank transfer. Each Verified Conversion is charged at the price you set for that Event and country, by debiting your Balance at the time it is verified.',
          'Kiqro may, at its discretion and after a credit review, grant you a credit line shown in the panel. Your Balance may then go below zero down to that limit. Amounts owed are invoiced at the start of each calendar month and are payable within the payment term shown in the panel (30 days unless agreed otherwise). If an invoice is not paid when due, the credit line is suspended until it is paid, and Kiqro may charge late-payment interest of 1% per month on the overdue amount, or the highest rate permitted by law if that is lower. Kiqro may change or withdraw a credit line with notice; amounts already owed remain payable on their terms.',
          'Held Conversions are not charged unless they are approved after review. Rejected conversions are never charged.',
          'When a campaign’s budget or your Balance is exhausted, the campaign stops accepting new users. Users who already started the offer may still complete later Events; those Events remain billable for up to the longest Event time limit of the campaign. Kiqro will not charge Events for which there is no Balance or available credit to cover them.',
          `Prices are in USD. Invoices are issued in USD or EUR as agreed, by ${ENTITY.name} during the transition period and by its successor afterwards. Prices exclude VAT and other taxes, which are added where applicable (for EU business customers, the reverse-charge mechanism applies where the conditions are met).`,
          'On termination, any unused Balance is refunded within 30 days to the account it was paid from, less bank or payment-provider fees and any amounts owed to Kiqro.',
        ],
      },
      {
        id: 'fraud',
        title: '7. Traffic quality, fraud and reversals',
        blocks: [
          'Kiqro screens clicks and Postbacks for invalid activity, including anonymized or data-centre connections, device farms, implausible timings and duplicate users. Clicks may be refused and conversions held or rejected as a result. Kiqro does not guarantee that all invalid activity is detected.',
          'You may dispute a Verified Conversion within the Reversal Window by an MMP rejection Postback, through the panel or via the API, stating the reason. Disputed amounts are credited back to your Balance automatically. Disputes after the Reversal Window are handled only where agreed in writing.',
          'Systematic disputes without a reasonable basis, or disputes used to recover payment for valid conversions, are a material breach of these Terms.',
        ],
      },
      {
        id: 'obligations',
        title: '8. Your obligations',
        blocks: [
          {
            list: [
              'You own or are licensed to promote the products in your campaigns, and they comply with applicable law and app store rules.',
              'Offer texts, creatives and instructions you provide are accurate and do not infringe third-party rights.',
              'You will not ask users to rate or review your app, or to provide personal data beyond what normal use of your product requires, as a condition of an Event.',
              'You will notify Kiqro without delay of changes that affect tracking or eligibility (for example a store removal, a changed event name or a tracking-link change).',
            ],
          },
        ],
      },
      {
        id: 'data',
        title: '9. Data protection',
        blocks: [
          'Kiqro does not share users’ names, e-mail addresses or other directly identifying data with advertisers. Between Kiqro and your MMP, only pseudonymous identifiers (click IDs and, where the user consented, device advertising IDs) and event data are exchanged.',
          'The parties’ roles and obligations regarding personal data are set out in the Data Protection Addendum, which forms part of these Terms.',
        ],
      },
      {
        id: 'confidentiality',
        title: '10. Confidentiality',
        blocks: [
          'Each party keeps the other’s non-public business information (including prices, volumes and performance data) confidential and uses it only to perform these Terms. This obligation survives termination for three years.',
        ],
      },
      {
        id: 'ip',
        title: '11. Intellectual property and publicity',
        blocks: [
          'You grant Kiqro and its publishers a non-exclusive licence to display your names, logos, icons and creatives in offerwalls for the duration of your campaigns. Kiqro will name you as a customer in public materials only with your prior written consent.',
        ],
      },
      {
        id: 'liability',
        title: '12. Liability',
        blocks: [
          'Except for breaches of confidentiality, data protection obligations, or liability that cannot be limited by law, each party’s total liability under these Terms is limited to the amounts paid by the Advertiser to Kiqro under these Terms in the 12 months before the event giving rise to the claim, and neither party is liable for indirect or consequential loss, including lost profits or revenue.',
          'Kiqro does not guarantee any volume of users or Events, any return on ad spend, or uninterrupted availability of the network.',
        ],
      },
      {
        id: 'term',
        title: '13. Term and termination',
        blocks: [
          'These Terms apply from your acceptance until terminated. Either party may terminate them on 30 days’ written notice, or immediately if the other party materially breaches them and does not cure the breach within 10 days of notice. Kiqro may suspend campaigns immediately where needed to stop fraud, legal violations or harm to users.',
        ],
      },
      {
        id: 'changes',
        title: '14. Changes to these Terms',
        blocks: [
          'Kiqro may change these Terms with at least 30 days’ notice by e-mail and in the panel. Changes apply to campaigns running after the effective date. If you do not agree, you may terminate before the effective date and receive a refund of your unused Balance.',
        ],
      },
      {
        id: 'law',
        title: '15. Governing law and disputes',
        blocks: [
          'These Terms are governed by the laws of the State of Delaware, United States, without regard to its conflict-of-laws rules. Disputes are resolved exclusively by the state or federal courts located in the State of Delaware, unless the parties agree on arbitration.',
          'These Terms are also published in Turkish for convenience. If the language versions differ, the English version prevails.',
        ],
      },
      {
        id: 'contact',
        title: '16. Contact',
        blocks: [`Questions about these Terms: ${ENTITY.salesEmail}.`],
      },
    ],
  },

  tr: {
    slug: 'terms',
    title: 'Reklamveren Hizmet Koşulları',
    summary: 'Kiqro ile Kiqro Network üzerinden doğrulanmış olay satın alan reklamverenler arasındaki sözleşme.',
    ...PUBLISHED,
    sections: [
      {
        id: 'parties',
        title: '1. Taraflar ve kapsam',
        blocks: [
          `Bu Reklamveren Hizmet Koşulları (“Koşullar”), ${ENTITY.name}, ${ENTITY.addressLine} (“Kiqro”, “biz”) tarafından işletilen performans reklam ağı Kiqro Network’ün, bu Koşulları kabul eden şirket (“Reklamveren”, “siz”) tarafından kullanımını düzenler.`,
          `Kiqro bu Koşulları ${SUCCESSOR.tr} devredebilir; devirden önce sizi yazılı olarak bilgilendiririz.`,
          'Her iki tarafça imzalanan bir Reklam Siparişi (“IO”), kampanyaya özel fiyat, bütçe veya koşullar belirleyebilir. IO ile bu Koşullar arasında çelişki olması halinde, o kampanya için IO geçerlidir.',
          'Bu Koşullar yalnızca ticari müşterilere uygulanır. Kiqro Network tüketicilere sunulmaz.',
        ],
      },
      {
        id: 'definitions',
        title: '2. Tanımlar',
        blocks: [
          {
            list: [
              '“Olay” — bir kampanya için tanımladığınız ve ülke bazında fiyatlandırdığınız kurulum veya uygulama içi eylem (örneğin bir seviyeye ulaşma, kayıt, ilk yatırım veya satın alma).',
              '“Postback” — mobil ölçüm ortağınız (“MMP”) veya kendi sunucunuz tarafından Kiqro’ya gönderilen, bir Olay’a ilişkin sunucudan sunucuya bildirim.',
              '“Doğrulanmış Dönüşüm” — Postback’iniz ile Kiqro’ya atfedilen ve Kiqro’nun kalite kontrollerinden (7. madde) geçen Olay.',
              '“Bekletilen Dönüşüm” — Kiqro’nun kalite kontrollerinin manuel incelemeye aldığı Olay. Onaylanmadıkça faturalandırılmaz.',
              '“Bakiye” — hesabınızda kullanılabilir durumdaki ön ödemeli tutar.',
              '“İtiraz Süresi” — Doğrulanmış Dönüşüm’den sonra ona itiraz edebileceğiniz süre (yazılı olarak aksi kararlaştırılmadıkça 30 gün).',
              '“Ödüllü trafik” — Olaylarınızı tamamladıkları için bir yayıncıdan ödül alan kullanıcılar.',
            ],
          },
        ],
      },
      {
        id: 'accounts',
        title: '3. Hesaplar',
        blocks: [
          'Kiqro, belirlediğiniz kişiler için panel hesapları oluşturur. Giriş bilgilerinin gizli tutulmasından, hesaplarınızla yapılan her işlemden ve yetkisiz erişim şüphesini bize gecikmeksizin bildirmekten siz sorumlusunuz.',
          'Şirket ve fatura bilgilerinizi doğru tutmalısınız. Kampanyaları etkinleştirmeden önce şirketinizi doğrulayabiliriz (örneğin KDV numarası, uygulama mağazasındaki geliştirici adı).',
        ],
      },
      {
        id: 'campaigns',
        title: '4. Kampanyalar',
        blocks: [
          'Her kampanyanın ürününü, Olaylarını, fiyatlarını, ülkelerini, bütçelerini ve zamanlamasını siz belirlersiniz. Kampanyalar ancak Kiqro tarafından incelendikten ve bir test Postback’i alındıktan sonra yayına girer.',
          'Kiqro Network’ün ödüllü trafik sağladığını ve kullanıcıların Olaylarınızı tamamladıkları için ödüllendirildiğini kabul edersiniz. Kendi politikalarınız ya da MMP’nizin veya uygulama mağazalarının politikaları ürününüz için ödüllü trafiği yasaklıyorsa Kiqro Network’ü kullanmamalısınız.',
          'Tüm kampanyalar Reklam İçerik Politikası’na uymalıdır. Kiqro, uymayan ya da makul görüşümüze göre kullanıcıları, yayıncıları veya Kiqro’yu hukuki ya da itibari riske sokan her kampanyayı reddedebilir, duraklatabilir veya durdurabilir.',
          'Kiqro ile koordineli olarak bir kampanyayı istediğiniz zaman duraklatabilir, bütçesini düşürebilir veya sonlandırabilirsiniz. Fiyat indirimleri yalnızca değişiklikten sonra teklife başlayan kullanıcılara uygulanır.',
        ],
      },
      {
        id: 'tracking',
        title: '5. Takip ve ölçüm',
        blocks: [
          'Atıf (attribution) MMP’niz tarafından yapılır. Kiqro takip linkini ve Postback’leri panelin Entegrasyon sayfasında açıklandığı şekilde yapılandırmalı ve kampanya süresince çalışır durumda tutmalısınız.',
          'Faturalandırmanın esası, Kiqro’nun aldığı Postback’lere ve Doğrulanmış Dönüşümlere ilişkin kayıtlarıdır. Bu kayıtlar bir takvim ayı için MMP verilerinizden %5’ten fazla farklıysa, taraflardan biri dönüşüm kaydındaki click ID’leri kullanarak mutabakat talep edebilir; taraflar farkı 30 gün içinde gidermek için iyi niyetle iş birliği yapar.',
          'Postback’i o Olay için belirlediğiniz süre sınırından sonra gelen veya bir Kiqro tıklamasına atfedilmeyen Olaylar faturalandırılmaz.',
        ],
      },
      {
        id: 'billing',
        title: '6. Fiyatlar, ön ödeme ve faturalandırma',
        blocks: [
          'Kampanyalar ön ödemelidir. Aksi kararlaştırılmadıkça asgari yükleme tutarı 500 USD’dir. Yüklemeler panelde Stripe aracılığıyla kartla veya banka havalesiyle yapılır. Her Doğrulanmış Dönüşüm, o Olay ve ülke için belirlediğiniz fiyattan, doğrulandığı anda Bakiyenizden düşülerek ücretlendirilir.',
          'Kiqro, kendi takdirine bağlı olarak ve kredi değerlendirmesinden sonra, panelde gösterilen bir kredi limiti tanımlayabilir. Bu durumda Bakiyeniz bu limite kadar sıfırın altına inebilir. Borçlanılan tutarlar her takvim ayının başında faturalandırılır ve panelde gösterilen ödeme vadesi içinde (aksi kararlaştırılmadıkça 30 gün) ödenir. Vadesinde ödenmeyen faturada kredi limiti ödeme yapılana kadar askıya alınır ve Kiqro gecikmiş tutar üzerinden aylık %1 veya, daha düşükse, yasaların izin verdiği en yüksek oranda gecikme faizi talep edebilir. Kiqro bir kredi limitini bildirimde bulunarak değiştirebilir veya geri çekebilir; daha önce doğmuş borçlar kendi koşullarına göre ödenmeye devam eder.',
          'Bekletilen Dönüşümler, inceleme sonrasında onaylanmadıkça ücretlendirilmez. Reddedilen dönüşümler hiçbir zaman ücretlendirilmez.',
          'Bir kampanyanın bütçesi veya Bakiyeniz tükendiğinde kampanya yeni kullanıcı kabul etmeyi durdurur. Teklife daha önce başlamış kullanıcılar sonraki Olayları tamamlayabilir; bu Olaylar, kampanyadaki en uzun Olay süre sınırına kadar faturalandırılabilir. Kiqro, karşılayacak Bakiye veya kullanılabilir kredi bulunmayan Olayları ücretlendirmez.',
          `Fiyatlar USD cinsindendir. Faturalar, kararlaştırıldığı şekilde USD veya EUR olarak, geçiş döneminde ${ENTITY.name} ve sonrasında halefi tarafından düzenlenir. Fiyatlara KDV ve diğer vergiler dahil değildir; bunlar geçerli olduğu durumlarda eklenir (AB’deki ticari müşteriler için, koşulları sağlandığında ters ibraz (reverse-charge) mekanizması uygulanır).`,
          'Sözleşmenin sona ermesi halinde kullanılmayan Bakiye, banka veya ödeme sağlayıcı masrafları ile Kiqro’ya olan borçlar düşüldükten sonra, ödemenin yapıldığı hesaba 30 gün içinde iade edilir.',
        ],
      },
      {
        id: 'fraud',
        title: '7. Trafik kalitesi, fraud ve itirazlar',
        blocks: [
          'Kiqro, tıklamaları ve Postback’leri anonimleştirilmiş veya veri merkezi bağlantıları, cihaz çiftlikleri, olağan dışı zamanlamalar ve mükerrer kullanıcılar dahil geçersiz faaliyetlere karşı tarar. Bunun sonucunda tıklamalar reddedilebilir, dönüşümler bekletilebilir veya reddedilebilir. Kiqro, tüm geçersiz faaliyetlerin tespit edileceğini garanti etmez.',
          'Bir Doğrulanmış Dönüşüm’e İtiraz Süresi içinde, MMP ret Postback’i ile, panelden veya API üzerinden, gerekçesini belirterek itiraz edebilirsiniz. İtiraz edilen tutarlar Bakiyenize otomatik olarak iade edilir. İtiraz Süresi’nden sonraki itirazlar yalnızca yazılı olarak kararlaştırılmışsa ele alınır.',
          'Makul bir dayanağı olmayan sistematik itirazlar veya geçerli dönüşümlerin bedelini geri almak için yapılan itirazlar, bu Koşulların esaslı ihlalidir.',
        ],
      },
      {
        id: 'obligations',
        title: '8. Yükümlülükleriniz',
        blocks: [
          {
            list: [
              'Kampanyalarınızdaki ürünlerin sahibisiniz veya onları tanıtmaya yetkilisiniz; ürünler yürürlükteki mevzuata ve uygulama mağazası kurallarına uygundur.',
              'Sağladığınız teklif metinleri, görseller ve talimatlar doğrudur ve üçüncü kişilerin haklarını ihlal etmez.',
              'Bir Olay’ın koşulu olarak kullanıcılardan uygulamanızı puanlamalarını veya yorumlamalarını, ya da ürününüzün olağan kullanımının gerektirdiğinden fazla kişisel veri vermelerini istemezsiniz.',
              'Takibi veya uygunluğu etkileyen değişiklikleri (örneğin mağazadan kaldırılma, olay adının değişmesi veya takip linkinin değişmesi) Kiqro’ya gecikmeksizin bildirirsiniz.',
            ],
          },
        ],
      },
      {
        id: 'data',
        title: '9. Kişisel verilerin korunması',
        blocks: [
          'Kiqro, kullanıcıların adlarını, e-posta adreslerini veya doğrudan kimlik belirleyici diğer verilerini reklamverenlerle paylaşmaz. Kiqro ile MMP’niz arasında yalnızca takma adlı tanımlayıcılar (click ID’ler ve, kullanıcının onay verdiği durumlarda, cihaz reklam kimlikleri) ile olay verileri paylaşılır.',
          'Tarafların kişisel verilere ilişkin rolleri ve yükümlülükleri, bu Koşulların bir parçası olan Veri Koruma Eki’nde düzenlenmiştir.',
        ],
      },
      {
        id: 'confidentiality',
        title: '10. Gizlilik',
        blocks: [
          'Her taraf, diğer tarafın kamuya açık olmayan ticari bilgilerini (fiyatlar, hacimler ve performans verileri dahil) gizli tutar ve yalnızca bu Koşulların ifası için kullanır. Bu yükümlülük, sözleşmenin sona ermesinden sonra üç yıl süreyle devam eder.',
        ],
      },
      {
        id: 'ip',
        title: '11. Fikri mülkiyet ve tanıtım',
        blocks: [
          'Kiqro’ya ve yayıncılarına, kampanyalarınız süresince adlarınızı, logolarınızı, ikonlarınızı ve görsellerinizi offerwall’larda göstermeleri için münhasır olmayan bir lisans verirsiniz. Kiqro, sizi kamuya açık materyallerde müşteri olarak ancak önceden yazılı onayınızla anar.',
        ],
      },
      {
        id: 'liability',
        title: '12. Sorumluluk',
        blocks: [
          'Gizlilik ve veri koruma yükümlülüklerinin ihlali ile kanunen sınırlandırılamayan sorumluluk hariç olmak üzere, her tarafın bu Koşullar kapsamındaki toplam sorumluluğu, talebe yol açan olaydan önceki 12 ay içinde Reklamveren tarafından bu Koşullar kapsamında Kiqro’ya ödenen tutarlarla sınırlıdır; taraflardan hiçbiri kâr veya gelir kaybı dahil dolaylı ya da sonuç olarak doğan zararlardan sorumlu değildir.',
          'Kiqro, herhangi bir kullanıcı veya Olay hacmini, reklam harcamasının getirisini ya da ağın kesintisiz erişilebilirliğini garanti etmez.',
        ],
      },
      {
        id: 'term',
        title: '13. Süre ve fesih',
        blocks: [
          'Bu Koşullar kabul ettiğiniz andan feshedilene kadar geçerlidir. Taraflardan her biri 30 gün önceden yazılı bildirimle, ya da diğer taraf Koşulları esaslı şekilde ihlal eder ve ihlali bildirimden itibaren 10 gün içinde gidermezse derhal feshedebilir. Kiqro, fraud’u, hukuka aykırılıkları veya kullanıcılara verilen zararı durdurmak için gerektiğinde kampanyaları derhal askıya alabilir.',
        ],
      },
      {
        id: 'changes',
        title: '14. Koşullarda değişiklik',
        blocks: [
          'Kiqro bu Koşulları, e-posta ve panel üzerinden en az 30 gün önceden bildirimde bulunarak değiştirebilir. Değişiklikler yürürlük tarihinden sonra devam eden kampanyalara uygulanır. Kabul etmemeniz halinde, yürürlük tarihinden önce sözleşmeyi feshedebilir ve kullanılmayan Bakiyenizin iadesini alabilirsiniz.',
        ],
      },
      {
        id: 'law',
        title: '15. Uygulanacak hukuk ve uyuşmazlıklar',
        blocks: [
          'Bu Koşullar, kanunlar ihtilafı kuralları dikkate alınmaksızın Amerika Birleşik Devletleri Delaware Eyaleti hukukuna tabidir. Taraflar tahkim üzerinde anlaşmadıkça uyuşmazlıklar münhasıran Delaware Eyaleti’ndeki eyalet veya federal mahkemelerde çözülür.',
          'Bu Koşulların Türkçe metni kolaylık amacıyla yayınlanmaktadır. Dil versiyonları arasında farklılık olması halinde İngilizce metin geçerlidir.',
        ],
      },
      {
        id: 'contact',
        title: '16. İletişim',
        blocks: [`Bu Koşullarla ilgili sorularınız için: ${ENTITY.salesEmail}.`],
      },
    ],
  },
};
