import type { LegalDoc } from './types';

export const cookies: LegalDoc = {
  slug: 'cookies',
  title: 'Cookie Notice',
  summary: 'The few cookies kiqronetwork.com sets, and why no consent banner is needed.',
  version: '0.1-draft (2026-10-29)',
  status: 'draft',
  sections: [
    {
      id: 'cookies',
      title: 'Cookies we use',
      blocks: [
        'The public website sets no cookies. The advertiser panel uses only the cookies below, which are needed for the service you requested; under the ePrivacy rules they do not require consent.',
        {
          table: {
            head: ['Name', 'Purpose', 'Duration'],
            rows: [
              ['kq_adv', 'Keeps you signed in to the advertiser panel (random token; httpOnly, secure)', '7 days'],
              ['kq_lang', 'Remembers the panel language you chose', '1 year'],
              ['kq_theme', 'Remembers light or dark mode', '1 year'],
            ],
          },
        },
        'We do not use analytics, advertising or third-party tracking cookies. If that changes, we will ask for your consent first and update this notice.',
      ],
    },
  ],
};
