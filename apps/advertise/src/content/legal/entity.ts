/**
 * Contracting entity and contacts used across the legal documents. During the transition
 * Kiqro Inc. contracts and invoices; once Kiqro Oy (Finland) is incorporated, new
 * advertisers move to the Oy (spec decision K-11).
 */
export const ENTITY = {
  name: 'Kiqro Inc.',
  /** Multi-line form for invoices (rendered with white-space: pre-line). */
  address: '407 E Ayre St #1489\nWilmington, DE 19804\nUSA',
  /** One-line form for running text. */
  addressLine: '407 E Ayre St #1489, Wilmington, DE 19804, USA',
  /** State of incorporation and company number, shown on invoices once known. */
  registration: '',
  salesEmail: 'contact@kiqro.com',
  privacyEmail: 'contact@kiqro.com',
  website: 'kiqronetwork.com',
};
