'use server';

import { savePricingGuide } from '@kiqro/network';
import { runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';

/** Fields: "price:<event>" for each quick-add event, and "help_en" / "help_tr". */
export async function savePricingGuideAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const prices: Record<string, string> = {};
    for (const [name, value] of form.entries()) {
      if (name.startsWith('price:') && typeof value === 'string') prices[name.slice(6)] = value;
    }
    await savePricingGuide(db, actor, { prices, help: { en: String(form.get('help_en') ?? ''), tr: String(form.get('help_tr') ?? '') } });
    return 'Tavsiye edilen fiyatlar kaydedildi; yeni kampanya ekranında hemen geçerli.';
  }, '/pricing');
}
