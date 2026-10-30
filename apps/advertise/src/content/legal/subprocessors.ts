import { TBD, type LegalDoc } from './types';

export const subprocessors: LegalDoc = {
  slug: 'subprocessors',
  title: 'Sub-processors',
  summary: 'Service providers that process personal data on Kiqro Network’s behalf.',
  version: '0.1-draft (2026-10-29)',
  status: 'draft',
  sections: [
    {
      id: 'list',
      title: 'Current sub-processors',
      blocks: [
        {
          table: {
            head: ['Provider', 'Purpose', 'Location of processing', 'Transfer safeguard'],
            rows: [
              [TBD('hosting provider'), 'Application and database hosting', 'EU', '—'],
              ['Cloudflare, Inc.', 'DNS, TLS, DDoS and bot protection, visitor country', 'Global edge network', 'EU–US DPF / SCCs'],
              ['Twilio Inc. (SendGrid)', 'Transactional e-mail (invitations, password resets, alerts)', 'United States', 'EU–US DPF / SCCs'],
              ['proxycheck.io', 'IP reputation checks for fraud prevention (IP address only)', TBD('confirm location'), TBD('confirm safeguard')],
            ],
          },
        },
        'We will update this page at least 30 days before adding a sub-processor that processes advertiser panel data, so customers can object.',
      ],
    },
  ],
};
