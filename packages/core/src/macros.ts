/**
 * Replaces {name} placeholders in a URL template with URL-encoded values.
 * Unknown placeholders are left untouched so a typo in a template stays visible in logs.
 */
export function fillMacros(template: string, values: Record<string, string | number | bigint | null | undefined>): string {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (whole, name: string) => {
    if (!(name in values)) return whole;
    const value = values[name];
    return value === null || value === undefined ? '' : encodeURIComponent(String(value));
  });
}

/** Lists the placeholders a template uses, e.g. to warn when a tracking link lacks {click_id}. */
export function macrosIn(template: string): string[] {
  return [...template.matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1]!);
}
