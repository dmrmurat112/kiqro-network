import 'server-only';
import { revalidatePath } from 'next/cache';
import { AdminError, type AdminUser } from '@kiqro/network/admin';
import { requireAdmin } from './session';

export type ActionState = { error?: string; ok?: string } | undefined;

/**
 * Wraps a server action: requires a signed-in admin, turns AdminError into a form message,
 * and revalidates the given path on success. Unexpected errors are logged, not shown.
 */
export async function runAction(
  fn: (actor: AdminUser) => Promise<string | void>,
  revalidate: string,
): Promise<ActionState> {
  const actor = await requireAdmin();
  try {
    const message = await fn(actor);
    revalidatePath(revalidate);
    return { ok: message || 'Kaydedildi.' };
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message };
    console.error('admin action failed', e);
    return { error: 'Beklenmeyen bir hata oluştu. Sunucu günlüğüne bakın.' };
  }
}

export const field = (form: FormData, name: string) => String(form.get(name) ?? '');
