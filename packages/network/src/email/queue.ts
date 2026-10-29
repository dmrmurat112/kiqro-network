import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { newId, schema, type Db, type DbOrTx } from '@kiqro/db';
import { retryDelayMs } from '../outbox.ts';
import type { Mailer } from './mailer.ts';
import { renderEmail, type EmailLocale, type EmailTemplate } from './templates.ts';

const { emailMessages } = schema;

export const MAX_EMAIL_ATTEMPTS = 8;
const LEASE_MS = 10 * 60_000;

/**
 * Renders and queues an e-mail. Call inside the same transaction as the change that causes it,
 * so a rolled-back change never sends mail. Delivery happens in the worker.
 */
export async function enqueueEmail(db: DbOrTx, to: string, template: EmailTemplate, locale: EmailLocale, now = new Date()): Promise<string> {
  const rendered = renderEmail(template, locale);
  const id = newId('email');
  await db.insert(emailMessages).values({ id, to, template: template.name, ...rendered, nextAttemptAt: now, createdAt: now });
  return id;
}

/** Sends due e-mails. Same lease pattern as publisher postbacks; returns how many were attempted. */
export async function deliverDueEmails(db: Db, mailer: Mailer, now = new Date(), batchSize = 50): Promise<number> {
  const due = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(emailMessages)
      .where(and(eq(emailMessages.status, 'pending'), lte(emailMessages.nextAttemptAt, now)))
      .orderBy(asc(emailMessages.nextAttemptAt))
      .limit(batchSize)
      .for('update', { skipLocked: true });
    if (rows.length) {
      await tx
        .update(emailMessages)
        .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
        .where(inArray(emailMessages.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  for (const msg of due) {
    const result = await mailer.send({ to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, category: msg.template });
    const attempts = msg.attempts + 1;
    if (result.ok) {
      await db
        .update(emailMessages)
        .set({ status: 'sent', attempts, sentAt: now, lastError: null, providerMessageId: result.providerMessageId ?? null })
        .where(eq(emailMessages.id, msg.id));
    } else {
      const failed = result.permanent || attempts >= MAX_EMAIL_ATTEMPTS;
      await db
        .update(emailMessages)
        .set({
          attempts,
          lastError: (result.error ?? 'unknown error').slice(0, 500),
          status: failed ? 'failed' : 'pending',
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
        })
        .where(eq(emailMessages.id, msg.id));
    }
  }
  return due.length;
}
