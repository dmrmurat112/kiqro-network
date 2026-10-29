import { newId, schema, type DbOrTx } from '@kiqro/db';

/** Records an admin change. Call inside the same transaction as the change itself. */
export async function audit(
  db: DbOrTx,
  adminUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  // bigint is not JSON-serialisable; amounts are logged as decimal strings by callers.
  await db.insert(schema.auditLog).values({ id: newId('audit'), adminUserId, action, entityType, entityId, details });
}
