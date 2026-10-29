import { closeStripeCheckout, completeStripeCheckout, verifyStripeSignature, type StripeCheckoutSession } from '@kiqro/network';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhook (Stripe Dashboard → Developers → Webhooks → https://advertise.kiqro.com/api/stripe/webhook).
 * Events: checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired.
 * The balance changes only here, after the signature check; never on the browser redirect.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: 'not_configured' }, { status: 503 });

  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)) {
    return Response.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const event = JSON.parse(payload) as { id: string; type: string; data: { object: StripeCheckoutSession } };
  const session = event.data.object;
  const base = process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200';

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const outcome = await completeStripeCheckout(db, session, base);
      // A mismatch needs a human: the charge succeeded but does not match the payment record.
      if (outcome === 'amount_mismatch') console.error(`stripe ${event.id}: amount mismatch for ${session.id}, not credited`);
      else console.log(`stripe ${event.id}: ${session.id} ${outcome}`);
      break;
    }
    case 'checkout.session.async_payment_failed':
      await closeStripeCheckout(db, session.id, 'failed');
      break;
    case 'checkout.session.expired':
      await closeStripeCheckout(db, session.id, 'expired');
      break;
  }
  return Response.json({ received: true });
}
