'use server';

import { approveHeldConversion, rejectHeldConversion } from '@kiqro/network/admin';
import { field, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';

export async function reviewAction(conversionId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const note = field(form, 'note');
    if (field(form, 'decision') === 'approve') {
      await approveHeldConversion(db, actor, conversionId, note);
      return 'Onaylandı; ödül postback\'i kuyruğa alındı.';
    }
    await rejectHeldConversion(db, actor, conversionId, note);
    return 'Reddedildi.';
  }, '/conversions');
}
