'use server';

import { createPlacement, createPublisher, updatePlacement } from '@kiqro/network/admin';
import { createAdvertiserUser, resendAdvertiserInvite } from '@kiqro/network/advertiser';
import { field, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';

const placementFields = (form: FormData) => ({
  name: field(form, 'name'),
  currencyName: field(form, 'currencyName'),
  pointsPerUsd: field(form, 'pointsPerUsd'),
  revsharePercent: field(form, 'revsharePercent'),
  postbackUrl: field(form, 'postbackUrl'),
  status: field(form, 'status') as 'active',
});

const links = () => ({ advertiseBaseUrl: process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200' });

/** Publisher panel logins (same panel and invite flow as advertisers). */
export async function createPublisherUserAction(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const email = field(form, 'email');
    await createAdvertiserUser(db, actor, orgId, { email, name: field(form, 'name'), locale: field(form, 'locale') as 'en' }, links());
    return `Hesap oluşturuldu; ${email} adresine parola belirleme bağlantısı gönderiliyor (72 saat geçerli).`;
  }, `/publishers/${orgId}`);
}

export async function resendPublisherInviteAction(orgId: string, userId: string, _: ActionState): Promise<ActionState> {
  return runAction(async (actor) => {
    await resendAdvertiserInvite(db, actor, userId, links());
    return 'Yeni davet bağlantısı gönderiliyor.';
  }, `/publishers/${orgId}`);
}

export async function createPublisherAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await createPublisher(db, actor, { name: field(form, 'name'), country: field(form, 'country') });
    return 'Yayıncı oluşturuldu.';
  }, '/publishers');
}

export async function createPlacementAction(publisherId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await createPlacement(db, actor, publisherId, placementFields(form));
    return 'Placement oluşturuldu.';
  }, `/publishers/${publisherId}`);
}

export async function updatePlacementAction(publisherId: string, placementId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await updatePlacement(db, actor, placementId, placementFields(form));
    return 'Placement güncellendi.';
  }, `/publishers/${publisherId}`);
}
