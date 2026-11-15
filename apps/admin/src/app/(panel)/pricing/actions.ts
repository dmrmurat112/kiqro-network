'use server';

import { savePricingGuide } from '@kiqro/network';
import { runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';

/** Fields: "price:<platform>:<event>" for each platform and quick-add event, and "help_en" / "help_tr". */
export async function savePricingGuideAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const prices: Record<string, Record<string, string>> = {};
    for (const [name, value] of form.entries()) {
      const match = /^price:(android|ios):(\w+)$/.exec(name);
      if (match && typeof value === 'string') (prices[match[1]!] ??= {})[match[2]!] = value;
    }
    await savePricingGuide(db, actor, { prices, help: { en: String(form.get('help_en') ?? ''), tr: String(form.get('help_tr') ?? '') } });
    return 'Tavsiye edilen fiyatlar kaydedildi; yeni kampanya ekranında hemen geçerli.';
  }, '/pricing');
}
