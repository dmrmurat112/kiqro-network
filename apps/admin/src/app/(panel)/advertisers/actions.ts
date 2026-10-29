'use server';

import { createAdvertiser, createProduct, recordTopUp } from '@kiqro/network/admin';
import { field, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';

export async function createAdvertiserAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await createAdvertiser(db, actor, {
      name: field(form, 'name'),
      country: field(form, 'country'),
      billingEntity: field(form, 'billingEntity') as 'kiqro_inc',
      invoiceCurrency: field(form, 'invoiceCurrency') as 'USD',
      reversalWindowDays: field(form, 'reversalWindowDays'),
      requireSignedPostbacks: form.get('requireSignedPostbacks') ?? undefined,
    });
    return 'Reklamveren oluşturuldu.';
  }, '/advertisers');
}

export async function topUpAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await recordTopUp(db, actor, orgId, { amountUsd: field(form, 'amountUsd'), memo: field(form, 'memo') });
    return 'Bakiye yüklendi.';
  }, `/advertisers/${orgId}`);
}

export async function createProductAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await createProduct(db, actor, orgId, {
      platform: field(form, 'platform') as 'android',
      storeId: field(form, 'storeId'),
      name: field(form, 'name'),
      iconUrl: field(form, 'iconUrl'),
      mmp: field(form, 'mmp') as 'appsflyer',
    });
    return 'Ürün eklendi.';
  }, `/advertisers/${orgId}`);
}
