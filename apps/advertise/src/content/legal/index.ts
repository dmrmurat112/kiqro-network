import { adPolicy } from './ad-policy';
import { cookies } from './cookies';
import { dpa } from './dpa';
import { privacy } from './privacy';
import { subprocessors } from './subprocessors';
import { terms } from './terms';
import type { LegalDoc, LegalLocale } from './types';

const DOCS = [terms, adPolicy, privacy, dpa, subprocessors, cookies];

/** Every legal document in the given language, in the order they are listed on the site. */
export const legalDocs = (lang: LegalLocale): LegalDoc[] => DOCS.map((d) => d[lang]);
export const LEGAL_SLUGS = DOCS.map((d) => d.en.slug);
export const legalDoc = (slug: string, lang: LegalLocale) => DOCS.find((d) => d.en.slug === slug)?.[lang];

/** Version of the Advertiser Terms that panel users must accept (see TERMS_REQUIRED). */
export const CURRENT_TERMS_VERSION = terms.en.version;

export type { LegalDoc } from './types';
