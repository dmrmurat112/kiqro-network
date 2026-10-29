'use server';

import { createPlacement, createPublisher, updatePlacement } from '@kiqro/network/admin';
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
