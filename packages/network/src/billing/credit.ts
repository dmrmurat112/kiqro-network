import { and, eq, lt } from 'drizzle-orm';
import { getAccountId, getBalance, schema, type DbOrTx } from '@kiqro/db';

const { invoices, organizations } = schema;

export interface CreditPosition {
  /** Ledger balance: prepaid money left, or debt when negative. */
  balance: bigint;
  creditLimit: bigint;
  /** An invoice is past its due date: the credit line is unusable until it is paid. */
  creditSuspended: boolean;
  /** What campaigns may still spend: balance plus the usable credit line. */
  spendable: bigint;
  /** Debt not yet paid (0 for prepaid advertisers in credit). */
  outstanding: bigint;
}

/**
 * How much an advertiser can spend. Prepaid advertisers (credit limit 0) spend their balance;
 * advertisers on credit terms may go down to -creditLimit unless an invoice is overdue.
 */
export async function creditPosition(db: DbOrTx, orgId: string, now = new Date()): Promise<CreditPosition> {
  // Sequential: inside a transaction all queries share one connection.
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { creditLimit: true } });
  const balance = await getBalance(db, await getAccountId(db, 'advertiser_balance', orgId));
  const overdue = await db.query.invoices.findFirst({ where: and(eq(invoices.orgId, orgId), eq(invoices.status, 'open'), lt(invoices.dueAt, now)), columns: { id: true } });
  const creditLimit = org?.creditLimit ?? 0n;
  const creditSuspended = creditLimit > 0n && overdue !== undefined;
  return {
    balance,
    creditLimit,
    creditSuspended,
    spendable: balance + (creditSuspended ? 0n : creditLimit),
    outstanding: balance < 0n ? -balance : 0n,
  };
}
