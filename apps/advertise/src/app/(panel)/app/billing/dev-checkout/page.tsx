import { notFound } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { paymentGatewayFromEnv } from '@kiqro/network';
import { Card, PageHeader } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';
import { devCheckoutAction } from '../actions';

export const dynamic = 'force-dynamic';

/** Stand-in for Stripe Checkout in local development (no Stripe keys). 404 everywhere else. */
export default async function DevCheckoutPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  if (paymentGatewayFromEnv()?.kind !== 'dev') notFound();
  const [{ org }, lang, { session = '' }] = await Promise.all([requireAdvertiserOrg(), panelLocale(), searchParams]);
  const payment = await db.query.payments.findFirst({ where: (p, { and, eq }) => and(eq(p.stripeSessionId, session), eq(p.orgId, org.id)) });
  if (!payment || payment.status !== 'pending') notFound();
  const t = PANEL[lang].billing;

  return (
    <>
      <PageHeader title={t.devCheckout} />
      <Card className="max-w-md p-6">
        <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-sm text-muted">
          <FlaskConical size={18} className="mt-0.5 shrink-0 text-warn" />
          {t.devCheckoutBody}
        </div>
        <div className="mt-6 text-sm text-muted">{org.name}</div>
        <div className="mt-1 font-mono text-4xl font-semibold tabular-nums">{usd(payment.amount, lang)}</div>
        <form action={devCheckoutAction} className="mt-6 flex gap-2">
          <input type="hidden" name="session" value={session} />
          <button name="outcome" value="paid" className="btn-primary flex-1 justify-center">
            {t.devPay}
          </button>
          <button name="outcome" value="canceled" className="rounded-xl border border-line px-4 text-sm text-muted hover:text-fg">
            {t.devCancel}
          </button>
        </form>
      </Card>
    </>
  );
}
