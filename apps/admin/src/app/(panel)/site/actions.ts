'use server';

import { saveSiteTexts, setSiteDefaultTheme } from '@kiqro/network/site';
import { field, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';

/** Saves one section of the landing copy: fields are named "en:<path>" and "tr:<path>". */
export async function saveSiteTextsAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const updates: Record<string, { en?: string; tr?: string }> = {};
    for (const [name, value] of form.entries()) {
      const match = /^(en|tr):(.+)$/.exec(name);
      if (!match || typeof value !== 'string') continue;
      (updates[match[2]!] ??= {})[match[1] as 'en' | 'tr'] = value;
    }
    const changed = await saveSiteTexts(db, actor, updates);
    return changed ? `${changed} metin kaydedildi; site 30 saniye içinde güncellenir.` : 'Değişiklik yok.';
  }, '/site');
}

export async function setSiteThemeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await setSiteDefaultTheme(db, actor, field(form, 'theme'));
    return 'Varsayılan tema kaydedildi; site 30 saniye içinde güncellenir.';
  }, '/site');
}
