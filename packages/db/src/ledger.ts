import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from './client.ts';
import { newId } from './ids.ts';
import { ledgerAccounts, ledgerEntries, ledgerTransactions } from './schema.ts';

type AccountKind = (typeof ledgerAccounts.$inferSelect)['kind'];

export interface LedgerEntryInput {
  accountId: string;
  amount: bigint;
}

export interface LedgerTransactionInput {
  type: string;
  refType?: string;
  refId?: string;
  memo?: string;
  entries: LedgerEntryInput[];
}

/** Returns the account id for (kind, org, currency), creating the account on first use. */
export async function getAccountId(db: DbOrTx, kind: AccountKind, orgId: string | null, currency = 'USD'): Promise<string> {
  await db.insert(ledgerAccounts).values({ id: newId('account'), kind, orgId, currency }).onConflictDoNothing();
  const [row] = await db
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(
      and(
        eq(ledgerAccounts.kind, kind),
        orgId === null ? isNull(ledgerAccounts.orgId) : eq(ledgerAccounts.orgId, orgId),
        eq(ledgerAccounts.currency, currency),
      ),
    );
  return row!.id;
}

/**
 * Locks the account row until the surrounding transaction ends, so concurrent spends
 * against the same advertiser balance are serialized. Must be called inside a transaction.
 */
export async function lockAccount(tx: DbOrTx, accountId: string): Promise<void> {
  await tx.execute(sql`select 1 from ${ledgerAccounts} where ${ledgerAccounts.id} = ${accountId} for update`);
}

export async function getBalance(db: DbOrTx, accountId: string): Promise<bigint> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId));
  return BigInt(row!.total);
}

/** Writes a balanced transaction. Throws if the entries do not sum to zero. */
export async function postTransaction(db: DbOrTx, input: LedgerTransactionInput): Promise<string> {
  const entries = input.entries.filter((e) => e.amount !== 0n);
  if (entries.length < 2) throw new Error('A ledger transaction needs at least two non-zero entries');
  const sum = entries.reduce((acc, e) => acc + e.amount, 0n);
  if (sum !== 0n) throw new Error(`Unbalanced ledger transaction (${input.type}): entries sum to ${sum}`);

  const transactionId = newId('transaction');
  await db.insert(ledgerTransactions).values({
    id: transactionId,
    type: input.type,
    refType: input.refType,
    refId: input.refId,
    memo: input.memo,
  });
  await db.insert(ledgerEntries).values(entries.map((e) => ({ id: newId('entry'), transactionId, accountId: e.accountId, amount: e.amount })));
  return transactionId;
}

/** Records money an advertiser has paid in (Stripe or bank transfer) as available balance. */
export async function topUpAdvertiser(db: DbOrTx, orgId: string, amount: bigint, memo?: string): Promise<string> {
  if (amount <= 0n) throw new Error('Top-up amount must be positive');
  const cash = await getAccountId(db, 'external_cash', null);
  const balance = await getAccountId(db, 'advertiser_balance', orgId);
  return postTransaction(db, {
    type: 'advertiser_topup',
    refType: 'organization',
    refId: orgId,
    memo,
    entries: [
      { accountId: cash, amount: -amount },
      { accountId: balance, amount },
    ],
  });
}
