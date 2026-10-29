export type Block = string | { list: string[] } | { table: { head: string[]; rows: string[][] } };

export interface LegalSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface LegalDoc {
  slug: string;
  title: string;
  /** Short line for the legal index and page metadata. */
  summary: string;
  /** Version shown on the page; bump it whenever the text changes materially. */
  version: string;
  /** Draft documents show a "pending legal review" banner and are not binding. */
  status: 'draft' | 'final';
  sections: LegalSection[];
}

/** Placeholder for facts only Kiqro or its lawyer can fill in. Rendered highlighted. */
export const TBD = (what: string) => `[● ${what}]`;
