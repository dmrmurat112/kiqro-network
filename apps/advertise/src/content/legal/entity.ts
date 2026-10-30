import { TBD } from './types';

/**
 * Contracting entity and contacts used across the legal documents. During the transition
 * Kiqro Inc. contracts and invoices; once Kiqro Oy (Finland) is incorporated, new
 * advertisers move to the Oy (spec decision K-11).
 */
export const ENTITY = {
  name: 'Kiqro Inc.',
  address: TBD('registered address of Kiqro Inc.'),
  registration: TBD('state of incorporation and company number'),
  successor: 'Kiqro Oy (Finland), once incorporated',
  salesEmail: 'contact@kiqro.com',
  privacyEmail: TBD('privacy contact e-mail, e.g. privacy@kiqro.com'),
  website: 'kiqronetwork.com',
};
