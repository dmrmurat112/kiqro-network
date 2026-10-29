'use server';

import { headers } from 'next/headers';
import { submitLead } from '@kiqro/network/advertiser';
import { db } from '@/lib/db';

export type DemoState = { status: 'idle' | 'success' | 'invalid' | 'rate_limited'; fields?: string[] };

export async function requestDemoAction(_: DemoState, form: FormData): Promise<DemoState> {
  // Honeypot: real users never see or fill this field.
  if (String(form.get('company_url') ?? '') !== '') return { status: 'success' };

  const h = await headers();
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const optional = (name: string) => String(form.get(name) ?? '').trim() || undefined;
  const result = await submitLead(
    db,
    {
      name: form.get('name'),
      email: form.get('email'),
      company: form.get('company'),
      website: optional('website'),
      vertical: optional('vertical'),
      monthlyBudget: optional('monthlyBudget'),
      message: optional('message'),
      locale: form.get('locale'),
    },
    ip,
    { to: process.env.LEADS_NOTIFY_EMAIL, adminBaseUrl: process.env.ADMIN_BASE_URL ?? 'http://localhost:4100' },
  );
  if (result.ok) return { status: 'success' };
  return { status: result.error, fields: result.fields };
}
