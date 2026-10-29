'use server';

import { redirect } from 'next/navigation';
import { AdminError, confirmTotpEnrollment } from '@kiqro/network/admin';
import type { ActionState } from '@/lib/action';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

export async function confirmTotpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin({ allowWithoutTotp: true });
  try {
    await confirmTotpEnrollment(db, user, String(form.get('code') ?? ''));
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message };
    throw e;
  }
  redirect('/');
}
