import { adPolicy } from './ad-policy';
import { cookies } from './cookies';
import { dpa } from './dpa';
import { privacy } from './privacy';
import { subprocessors } from './subprocessors';
import { terms } from './terms';
import type { LegalDoc } from './types';

export const LEGAL_DOCS: LegalDoc[] = [terms, adPolicy, privacy, dpa, subprocessors, cookies];
export const legalDoc = (slug: string) => LEGAL_DOCS.find((d) => d.slug === slug);

/** Version of the Advertiser Terms that panel users must accept (see TERMS_REQUIRED). */
export const CURRENT_TERMS_VERSION = terms.version;

export type { LegalDoc } from './types';
