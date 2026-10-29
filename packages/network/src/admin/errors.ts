import { ZodError } from 'zod';
import { translateMessage } from '../validation.ts';
import { can, type AdminUser } from './auth.ts';

/** An error whose message is safe and meant to be shown to the admin user (Turkish). */
export class AdminError extends Error {}

export function requirePermission(actor: AdminUser, action: Parameters<typeof can>[1]): void {
  if (!can(actor, action)) throw new AdminError('Bu işlem için yetkiniz yok.');
}

/** Turns zod issues into one readable line for the form. */
export function describeValidation(error: ZodError): string {
  return error.issues.map((i) => {
    const message = translateMessage(i.message, 'tr');
    return i.path.length ? `${i.path.join('.')}: ${message}` : message;
  }).join(' · ');
}
