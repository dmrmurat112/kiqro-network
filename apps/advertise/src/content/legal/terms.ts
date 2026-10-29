import { ENTITY } from './entity';
import { TBD, type LegalDoc } from './types';

export const terms: LegalDoc = {
  slug: 'terms',
  title: 'Advertiser Terms of Service',
  summary: 'The agreement between Kiqro and advertisers that buy verified events on Kiqro Network.',
  version: '0.1-draft (2026-10-29)',
  status: 'draft',
  sections: [
    {
      id: 'parties',
      title: '1. Parties and scope',
      blocks: [
        `These Advertiser Terms of Service (the “Terms”) govern the use of Kiqro Network, the performance advertising network operated by ${ENTITY.name}, ${ENTITY.address}, ${ENTITY.registration} (“Kiqro”, “we”), by the company that accepts them (the “Advertiser”, “you”).`,
        `Kiqro may assign these Terms to ${ENTITY.successor}; we will notify you in writing before doing so.`,
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
        `Kiqro may, at its discretion and after a credit review, grant you a credit line shown in the panel. Your Balance may then go below zero down to that limit. Amounts owed are invoiced at the start of each calendar month and are payable within the payment term shown in the panel (30 days unless agreed otherwise). If an invoice is not paid when due, the credit line is suspended until it is paid, and Kiqro may charge late-payment interest of ${TBD('rate')}. Kiqro may change or withdraw a credit line with notice; amounts already owed remain payable on their terms.`,
        'Held Conversions are not charged unless they are approved after review. Rejected conversions are never charged.',
        'When a campaign’s budget or your Balance is exhausted, the campaign stops accepting new users. Users who already started the offer may still complete later Events; those Events remain billable for up to the longest Event time limit of the campaign. Kiqro will not charge Events for which there is no Balance or available credit to cover them.',
        `Prices are in USD. Invoices are issued in USD or EUR as agreed, by ${ENTITY.name} during the transition period and by its successor afterwards. Prices exclude VAT and other taxes, which are added where applicable (for EU business customers, the reverse-charge mechanism applies where the conditions are met).`,
        `On termination, any unused Balance is refunded within ${TBD('number')} days to the account it was paid from, less bank or payment-provider fees and any amounts owed to Kiqro.`,
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
        `Except for breaches of confidentiality, data protection obligations, or liability that cannot be limited by law, each party’s total liability under these Terms is limited to ${TBD('cap — e.g. the amounts paid to Kiqro in the 12 months before the claim')}, and neither party is liable for indirect or consequential loss, including lost profits or revenue.`,
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
      blocks: [`These Terms are governed by ${TBD('governing law — e.g. the laws of Finland')}. Disputes are resolved by ${TBD('forum — e.g. the Helsinki District Court')}, unless the parties agree on arbitration.`],
    },
    {
      id: 'contact',
      title: '16. Contact',
      blocks: [`Questions about these Terms: ${ENTITY.salesEmail}.`],
    },
  ],
};
