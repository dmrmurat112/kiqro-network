import { ENTITY } from './entity';
import { TBD, type LegalDoc } from './types';

export const privacy: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Notice — advertise.kiqro.com',
  summary: 'How Kiqro handles personal data of website visitors, demo requesters and advertiser panel users.',
  version: '0.1-draft (2026-10-29)',
  status: 'draft',
  sections: [
    {
      id: 'scope',
      title: '1. Who we are and what this covers',
      blocks: [
        `${ENTITY.name}, ${ENTITY.address} (“Kiqro”) is the controller for the personal data described here. Contact: ${ENTITY.privacyEmail}.`,
        'This notice covers the advertise.kiqro.com website, the demo request form and the advertiser panel. It does not cover the Kiqro rewards app; its users are covered by the privacy policy at kiqro.com.',
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
            `Invoices and accounting records: as required by accounting law (${TBD('confirm period with accountant')}).`,
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
      title: '5. Transfers outside the EU/EEA',
      blocks: [
        'Our hosting is in the EU. Some providers, such as our e-mail provider, are based in the United States. Such transfers rely on the EU–US Data Privacy Framework where the provider is certified, or on the European Commission’s Standard Contractual Clauses with supplementary measures.',
      ],
    },
    {
      id: 'rights',
      title: '6. Your rights',
      blocks: [
        `You may request access to, correction or deletion of your personal data, restriction of or objection to its processing, and data portability. Write to ${ENTITY.privacyEmail}; we answer within one month.`,
        `You may also lodge a complaint with a supervisory authority — in Finland the Data Protection Ombudsman (tietosuoja.fi) — or with the authority of your country of residence. ${TBD('add Turkish KVKK notice if Turkish entity processes data')}`,
      ],
    },
    {
      id: 'security',
      title: '7. Security',
      blocks: [
        'Passwords are stored only as salted hashes; sessions and password links are random tokens of which we store only a hash. Access to the admin systems requires two-factor authentication, and administrative actions are logged.',
      ],
    },
    {
      id: 'changes',
      title: '8. Changes',
      blocks: ['We will publish changes to this notice on this page and, for material changes, inform panel users by e-mail.'],
    },
  ],
};
