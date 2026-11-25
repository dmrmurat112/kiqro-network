'use server';

import { revalidatePath } from 'next/cache';
import { ADVERTISER_TEST_CLICKS_PER_DAY, createAdvertiserTestClick } from '@kiqro/network';
import { db } from '@/lib/db';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';

export interface TestClickState {
  clickId?: string;
  ctitMinSeconds?: number;
  error?: string;
}

/** Creates a test click on one of the advertiser's own campaigns. */
export async function createTestClickAction(_: TestClickState | undefined, form: FormData): Promise<TestClickState> {
  const [{ org }, lang] = await Promise.all([requireAdvertiserOrg(), panelLocale()]);
  const t = PANEL[lang].integration.test;
  const result = await createAdvertiserTestClick(db, org.id, String(form.get('campaignId') ?? ''));
  if (!result.ok) return { error: result.reason === 'limit' ? t.limit.replace('{n}', String(ADVERTISER_TEST_CLICKS_PER_DAY)) : t.notFound };
  revalidatePath('/app/integration');
  return { clickId: result.clickId, ctitMinSeconds: result.ctitMinSeconds };
}
