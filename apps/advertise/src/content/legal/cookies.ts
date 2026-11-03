import { PUBLISHED, type LocalizedDoc } from './types';

export const cookies: LocalizedDoc = {
  en: {
    slug: 'cookies',
    title: 'Cookie Notice',
    summary: 'The few cookies kiqronetwork.com sets, and why no consent banner is needed.',
    ...PUBLISHED,
    sections: [
      {
        id: 'cookies',
        title: 'Cookies we use',
        blocks: [
          'kiqronetwork.com uses only the cookies below. Each is needed for a function you use or a choice you make; under the ePrivacy rules they do not require consent. The public website sets a cookie only when you switch between light and dark mode.',
          {
            table: {
              head: ['Name', 'Purpose', 'Duration'],
              rows: [
                ['kq_adv', 'Keeps you signed in to the advertiser panel (random token; httpOnly, secure)', '7 days'],
                ['kq_lang', 'Remembers the panel language you chose', '1 year'],
                ['kq_theme', 'Remembers light or dark mode on the website and in the panel', '1 year'],
              ],
            },
          },
          'We do not use analytics, advertising or third-party tracking cookies. If that changes, we will ask for your consent first and update this notice.',
        ],
      },
    ],
  },

  tr: {
    slug: 'cookies',
    title: 'Çerez Bildirimi',
    summary: 'kiqronetwork.com’un kullandığı birkaç çerez ve neden çerez onay bandı gerekmediği.',
    ...PUBLISHED,
    sections: [
      {
        id: 'cookies',
        title: 'Kullandığımız çerezler',
        blocks: [
          'kiqronetwork.com yalnızca aşağıdaki çerezleri kullanır. Her biri kullandığınız bir işlev veya yaptığınız bir tercih için gereklidir; ePrivacy kuralları uyarınca onay gerektirmez. Herkese açık web sitesi, yalnızca açık ve koyu tema arasında geçiş yaptığınızda bir çerez oluşturur.',
          {
            table: {
              head: ['Ad', 'Amaç', 'Süre'],
              rows: [
                ['kq_adv', 'Reklamveren panelinde oturumunuzu açık tutar (rastgele anahtar; httpOnly, secure)', '7 gün'],
                ['kq_lang', 'Seçtiğiniz panel dilini hatırlar', '1 yıl'],
                ['kq_theme', 'Web sitesinde ve panelde açık veya koyu temayı hatırlar', '1 yıl'],
              ],
            },
          },
          'Analitik, reklam veya üçüncü taraf takip çerezleri kullanmıyoruz. Bu değişirse önce onayınızı isteyecek ve bu bildirimi güncelleyeceğiz.',
        ],
      },
    ],
  },
};
