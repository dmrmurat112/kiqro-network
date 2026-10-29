import { ENTITY } from './entity';
import { TBD, type LegalDoc } from './types';

export const dpa: LegalDoc = {
  slug: 'dpa',
  title: 'Data Protection Addendum',
  summary: 'The parties’ roles and obligations for personal data exchanged when running campaigns.',
  version: '0.1-draft (2026-10-29)',
  status: 'draft',
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
        `${TBD('lawyer to confirm the role analysis, in particular for MMP-mediated data flows')}`,
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
            'Each party has a legal basis for its own processing and gives users the information required by GDPR articles 13–14.',
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
            'Hosting in the EU; encryption in transit (TLS) and at rest.',
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
      blocks: ['This Addendum applies as long as data is exchanged under the Terms and survives termination for data still held by either party.'],
    },
  ],
};
