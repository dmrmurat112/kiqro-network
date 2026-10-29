'use server';

import { createAdvertiser, createProduct, recordTopUp, setCreditTerms } from '@kiqro/network/admin';
import { createAdvertiserUser, resendAdvertiserInvite } from '@kiqro/network/advertiser';
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

const links = () => ({ advertiseBaseUrl: process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200' });

export async function createAdvertiserUserAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const email = field(form, 'email');
    await createAdvertiserUser(db, actor, orgId, { email, name: field(form, 'name'), locale: field(form, 'locale') as 'en' }, links());
    return `Hesap oluşturuldu; ${email} adresine parola belirleme bağlantısı gönderiliyor (72 saat geçerli).`;
  }, `/advertisers/${orgId}`);
}

export async function resendInviteAction(orgId: string, userId: string, _: ActionState): Promise<ActionState> {
  return runAction(async (actor) => {
    await resendAdvertiserInvite(db, actor, userId, links());
    return 'Yeni davet bağlantısı gönderiliyor; öncekiler geçersiz oldu.';
  }, `/advertisers/${orgId}`);
}

export async function topUpAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await recordTopUp(db, actor, orgId, { amountUsd: field(form, 'amountUsd'), memo: field(form, 'memo'), method: field(form, 'method') as 'bank_transfer' }, links());
    return 'Ödeme kaydedildi; bakiyeye eklendi ve açık faturalara uygulandı.';
  }, `/advertisers/${orgId}`);
}

export async function creditTermsAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await setCreditTerms(db, actor, orgId, { creditLimitUsd: field(form, 'creditLimitUsd'), paymentTermsDays: field(form, 'paymentTermsDays') });
    return 'Kredi koşulları güncellendi.';
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
