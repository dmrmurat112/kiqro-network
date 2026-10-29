import { and, count, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { newId, schema, type Db } from '@kiqro/db';
import { audit } from '../admin/audit.ts';
import type { AdminUser } from '../admin/auth.ts';
import { AdminError, requirePermission } from '../admin/errors.ts';

const { leads } = schema;

export const leadInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  company: z.string().trim().min(2).max(160),
  website: z.string().trim().max(300).optional(),
  vertical: z.enum(['games', 'fintech', 'ecommerce', 'saas', 'other']).optional(),
  monthlyBudget: z.enum(['<5k', '5k-20k', '20k-100k', '>100k']).optional(),
  message: z.string().trim().max(2000).optional(),
  locale: z.enum(['en', 'tr']),
});

const MAX_LEADS_PER_IP_PER_HOUR = 5;

export type LeadResult = { ok: true } | { ok: false; error: 'invalid' | 'rate_limited'; fields?: string[] };

/** Stores a demo request from the public site. Throttled per IP; the form also has a honeypot. */
export async function submitLead(db: Db, input: unknown, ip: string | null, now = new Date()): Promise<LeadResult> {
  const parsed = leadInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid', fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  if (ip) {
    const [recent] = await db
      .select({ n: count() })
      .from(leads)
      .where(and(eq(leads.ip, ip), gt(leads.createdAt, new Date(now.getTime() - 3_600_000))));
    if (recent!.n >= MAX_LEADS_PER_IP_PER_HOUR) return { ok: false, error: 'rate_limited' };
  }
  await db.insert(leads).values({ id: newId('lead'), ...parsed.data, website: parsed.data.website || null, ip, createdAt: now });
  return { ok: true };
}

export async function listLeads(db: Db, limit = 200) {
  return db.select().from(leads).orderBy(desc(leads.createdAt)).limit(limit);
}

export async function setLeadStatus(db: Db, actor: AdminUser, leadId: string, status: (typeof leads.$inferSelect)['status']): Promise<void> {
  requirePermission(actor, 'manage_campaigns');
  await db.transaction(async (tx) => {
    const lead = await tx.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!lead) throw new AdminError('Talep bulunamadı.');
    await tx.update(leads).set({ status }).where(eq(leads.id, leadId));
    await audit(tx, actor.id, 'lead.status', 'lead', leadId, { from: lead.status, to: status });
  });
}
