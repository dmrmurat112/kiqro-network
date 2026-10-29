'use server';

import { redirect } from 'next/navigation';
import { AdminError, approveCampaign, createCampaign, getCampaignForm, returnCampaign, setCampaignStatus, updateCampaign, type CampaignInput } from '@kiqro/network/admin';
import { field, runAction, type ActionState } from '@/lib/action';
import { db } from '@/lib/db';

function readCampaign(form: FormData): CampaignInput {
  let tasks: CampaignInput['tasks'];
  try {
    tasks = JSON.parse(field(form, 'tasks'));
  } catch {
    throw new AdminError('Görev listesi okunamadı.');
  }
  return {
    productId: field(form, 'productId'),
    name: field(form, 'name'),
    trackingUrl: field(form, 'trackingUrl'),
    countries: field(form, 'countries').split(/[\s,]+/).filter(Boolean),
    totalBudgetUsd: field(form, 'totalBudgetUsd'),
    dailyBudgetUsd: field(form, 'dailyBudgetUsd'),
    startAt: field(form, 'startAt'),
    endAt: field(form, 'endAt'),
    attributionWindowDays: field(form, 'attributionWindowDays'),
    ctitMinSeconds: field(form, 'ctitMinSeconds'),
    titleEn: field(form, 'titleEn'),
    titleTr: field(form, 'titleTr'),
    descriptionEn: field(form, 'descriptionEn'),
    descriptionTr: field(form, 'descriptionTr'),
    tasks,
  };
}

export async function createCampaignAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async (actor) => {
    id = await createCampaign(db, actor, readCampaign(form));
  }, '/campaigns');
  if (result?.error) return result;
  redirect(`/campaigns/${id}`);
}

export async function updateCampaignAction(campaignId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await updateCampaign(db, actor, campaignId, readCampaign(form));
    return 'Kampanya güncellendi.';
  }, `/campaigns/${campaignId}`);
}

/** Copies a campaign (with tasks and prices) into a new draft, e.g. to change prices after launch. */
export async function duplicateCampaignAction(campaignId: string, _: ActionState): Promise<ActionState> {
  let id = '';
  const result = await runAction(async (actor) => {
    const source = await getCampaignForm(db, campaignId);
    if (!source) throw new AdminError('Kampanya bulunamadı.');
    id = await createCampaign(db, actor, { ...source.form, name: `${source.form.name} (kopya)` });
  }, '/campaigns');
  if (result?.error) return result;
  redirect(`/campaigns/${id}`);
}

export async function setStatusAction(campaignId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await setCampaignStatus(db, actor, campaignId, field(form, 'status') as 'active');
    return 'Durum güncellendi.';
  }, `/campaigns/${campaignId}`);
}

const reviewLinks = () => ({ advertiseBaseUrl: process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200' });

export async function approveCampaignAction(campaignId: string, _: ActionState): Promise<ActionState> {
  return runAction(async (actor) => {
    await approveCampaign(db, actor, campaignId, reviewLinks());
    return 'Onaylandı; kampanya yayında ve reklamverene e-posta gönderiliyor.';
  }, `/campaigns/${campaignId}`);
}

export async function returnCampaignAction(campaignId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await returnCampaign(db, actor, campaignId, field(form, 'note'), reviewLinks());
    return 'Reklamverene notla geri gönderildi.';
  }, `/campaigns/${campaignId}`);
}
