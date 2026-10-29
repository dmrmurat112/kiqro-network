import { ENTITY } from './entity';
import type { LegalDoc } from './types';

export const adPolicy: LegalDoc = {
  slug: 'ad-policy',
  title: 'Advertising Content Policy',
  summary: 'What may and may not be promoted on Kiqro Network, and the rules for offer tasks.',
  version: '0.1-draft (2026-10-29)',
  status: 'draft',
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
};
