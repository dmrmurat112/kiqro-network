'use server';

import { notFound, redirect } from 'next/navigation';
import { paymentGatewayFromEnv } from '@kiqro/network';
import { settleDevCheckout, startTopUp } from '@kiqro/network/advertiser';
import { db } from '@/lib/db';
import { panelLocale, requireAdvertiser } from '@/lib/session';

const advertiseBaseUrl = () => process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200';

export interface TopUpState {
  error?: string;
}

/** Starts a card payment and sends the browser to Stripe Checkout. */
export async function topUpAction(_: TopUpState | undefined, form: FormData): Promise<TopUpState> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const invoiceId = String(form.get('invoiceId') ?? '') || undefined;
  const result = await startTopUp(db, session, { amountUsd: String(form.get('amountUsd') ?? ''), invoiceId }, paymentGatewayFromEnv(), { advertiseBaseUrl: advertiseBaseUrl() }, lang);
  if (!result.ok) return { error: result.message };
  redirect(result.url);
}

/** The dev stand-in for Stripe Checkout; unavailable as soon as Stripe keys are configured. */
export async function devCheckoutAction(form: FormData): Promise<void> {
  if (paymentGatewayFromEnv()?.kind !== 'dev') notFound();
  const { org } = await requireAdvertiser();
  const outcome = form.get('outcome') === 'paid' ? 'paid' : 'canceled';
  const payment = await settleDevCheckout(db, org.id, String(form.get('session') ?? ''), outcome, advertiseBaseUrl());
  if (!payment) notFound();
  redirect(outcome === 'paid' ? `/app/billing?paid=${payment.id}` : '/app/billing?canceled=1');
}
