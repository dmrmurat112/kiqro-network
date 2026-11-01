import Link from 'next/link';
import { AlertTriangle, FileText, CheckCircle2, Clock, Landmark, Wallet, XCircle } from 'lucide-react';
import { MAX_CARD_TOPUP_USD, MIN_TOPUP_USD } from '@kiqro/network';
import { advertiserPayment, billingOverview } from '@kiqro/network/advertiser';
import { Card, Empty, PageHeader, StatusPill } from '@/components/panel/ui';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiserOrg } from '@/lib/session';
import { PayInvoiceButton, TopUpForm } from './TopUpForm';

export const dynamic = 'force-dynamic';

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const day = (d: Date, lang: string) => new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
const month = (d: Date, lang: string) => new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

// Pill colours reuse the panel's status palette.
const PAYMENT_PILL: Record<string, string> = { succeeded: 'active', pending: 'in_review', failed: 'refunded', expired: 'draft', paid: 'active', open: 'in_review', void: 'draft', overdue: 'refunded' };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paid?: string; canceled?: string }> }) {
  const [{ org }, lang, sp] = await Promise.all([requireAdvertiserOrg(), panelLocale(), searchParams]);
  const t = PANEL[lang].billing;
  const { position: pos, payments, invoices } = await billingOverview(db, org.id);
  const returned = sp.paid ? await advertiserPayment(db, org.id, sp.paid) : undefined;
  const overdue = invoices.find((i) => i.overdue);
  const hasCredit = pos.creditLimit > 0n;
  const usedPct = hasCredit ? Math.min(100, Number((pos.outstanding * 1000n) / pos.creditLimit) / 10) : 0;
  const entity = org.billingEntity === 'kiqro_oy' ? 'Kiqro Oy' : 'Kiqro Inc.';

  return (
    <>
      <PageHeader title={t.title} sub={t.sub} />

      {returned?.status === 'succeeded' && (
        <Notice tone="good" icon={<CheckCircle2 size={18} />} title={t.paidTitle}>
          {fill(t.paidBody, { amount: usd(returned.amount, lang) })}
        </Notice>
      )}
      {returned && returned.status === 'pending' && (
        <Notice tone="warn" icon={<Clock size={18} />} title={t.pendingTitle}>
          {t.pendingBody}
        </Notice>
      )}
      {(hasCredit || invoices.length > 0) && !org.billingAddress && (
        <Notice tone="warn" icon={<FileText size={18} />}>
          {t.detailsMissing}{' '}
          <Link href="/app/account#billing-details" className="font-medium text-violet-400 hover:text-violet-300">
            {t.detailsLink} →
          </Link>
        </Notice>
      )}
      {sp.canceled && <Notice tone="muted" icon={<XCircle size={18} />}>{t.canceled}</Notice>}
      {overdue && pos.creditSuspended && (
        <Notice tone="bad" icon={<AlertTriangle size={18} />}>
          {fill(t.suspended, { number: overdue.number })}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="relative overflow-hidden p-6 lg:col-span-2">
          <div className="absolute -top-32 -right-28 h-72 w-72 bg-[radial-gradient(closest-side,rgb(139_92_246/0.24),transparent)]" />
          <div className="absolute -bottom-36 -left-24 h-64 w-64 bg-[radial-gradient(closest-side,rgb(251_146_60/0.12),transparent)]" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Wallet size={16} className="text-violet-400" /> {t.available}
            </div>
            <div className={`mt-2 font-mono text-4xl font-semibold tracking-tight tabular-nums ${pos.spendable <= 0n ? 'text-bad' : ''}`}>{usd(pos.spendable > 0n ? pos.spendable : 0n, lang)}</div>

            <dl className="mt-6 grid gap-3 text-sm">
              <Row label={pos.balance < 0n ? t.owed : t.balance} value={usd(pos.balance < 0n ? -pos.balance : pos.balance, lang)} warn={pos.balance < 0n} />
              {hasCredit && (
                <>
                  <Row label={t.creditLine} value={usd(pos.creditLimit, lang)} />
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
                      <div className={`h-full rounded-full ${pos.creditSuspended ? 'bg-bad' : 'bg-gradient-to-r from-violet-500 to-orange-400'}`} style={{ width: `${Math.max(usedPct, 1)}%` }} />
                    </div>
                    <div className="mt-1.5 text-xs text-subtle">
                      {usd(pos.outstanding, lang)} {t.creditUsed} · {usedPct.toFixed(0)}%
                    </div>
                  </div>
                  <Row label={t.terms} value={fill(t.termsDays, { days: String(org.paymentTermsDays) })} />
                </>
              )}
            </dl>
            {!hasCredit && <p className="mt-5 text-xs leading-relaxed text-subtle">{t.prepaidOnly}</p>}
            <p className="mt-5 flex items-center gap-2 text-xs text-subtle">
              <Landmark size={13} /> {fill(t.entity, { entity })}
            </p>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-3">
          <h2 className="mb-4 font-semibold">{t.topUpTitle}</h2>
          <TopUpForm t={t} lang={lang} min={Number(MIN_TOPUP_USD)} max={Number(MAX_CARD_TOPUP_USD)} />
        </Card>
      </div>

      {(hasCredit || invoices.length > 0) && (
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold">{t.invoices}</h2>
            <p className="mt-0.5 text-xs text-subtle">{t.invoicesSub}</p>
          </div>
          {invoices.length === 0 ? (
            <Empty>{t.noInvoices}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-subtle">
                  <tr className="border-b border-line">
                    <th className="px-5 py-3 font-medium">{t.cols.number}</th>
                    <th className="px-5 py-3 font-medium">{t.cols.period}</th>
                    <th className="px-5 py-3 text-right font-medium">{t.cols.amount}</th>
                    <th className="px-5 py-3 text-right font-medium">{t.cols.remaining}</th>
                    <th className="px-5 py-3 font-medium">{t.cols.due}</th>
                    <th className="px-5 py-3 font-medium">{t.cols.status}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const state = inv.overdue ? 'overdue' : inv.status;
                    return (
                      <tr key={inv.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">
                          <Link href={`/app/billing/invoices/${inv.id}`} className="inline-flex items-center gap-1.5 text-violet-400 hover:text-violet-300">
                            <FileText size={13} /> {inv.number}
                          </Link>
                        </td>
                        <td className="px-5 py-3 capitalize">{month(inv.periodStart, lang)}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">{usd(inv.amount, lang)}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">{usd(inv.amount - inv.amountPaid, lang)}</td>
                        <td className={`px-5 py-3 whitespace-nowrap ${inv.overdue ? 'text-bad' : ''}`}>{day(inv.dueAt, lang)}</td>
                        <td className="px-5 py-3">
                          <StatusPill status={PAYMENT_PILL[state] ?? state} label={t.statuses[state] ?? state} />
                        </td>
                        <td className="px-5 py-3 text-right">{inv.status === 'open' && <PayInvoiceButton invoiceId={inv.id} label={t.payInvoice} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold">{t.payments}</h2>
        </div>
        {payments.length === 0 ? (
          <Empty>{t.noPayments}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-medium">{t.cols.date}</th>
                  <th className="px-5 py-3 font-medium">{t.cols.method}</th>
                  <th className="px-5 py-3 text-right font-medium">{t.cols.amount}</th>
                  <th className="px-5 py-3 font-medium">{t.cols.status}</th>
                  <th className="px-5 py-3 font-medium">{t.cols.reference}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap">{dateTime(p.completedAt ?? p.createdAt, lang)}</td>
                    <td className="px-5 py-3">{t.methods[p.method] ?? p.method}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{usd(p.amount, lang)}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={PAYMENT_PILL[p.status] ?? p.status} label={t.statuses[p.status] ?? p.status} />
                    </td>
                    <td className="max-w-[16rem] truncate px-5 py-3 font-mono text-xs text-subtle">{p.reference ?? p.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-mono font-semibold tabular-nums ${warn ? 'text-warn' : ''}`}>{value}</dd>
    </div>
  );
}

const TONES = {
  good: 'border-good/30 bg-good/8 text-good',
  warn: 'border-warn/30 bg-warn/8 text-warn',
  bad: 'border-bad/30 bg-bad/8 text-bad',
  muted: 'border-line bg-surface text-muted',
};

function Notice({ tone, icon, title, children }: { tone: keyof typeof TONES; icon: React.ReactNode; title?: string; children: React.ReactNode }) {
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${TONES[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="text-fg">
        {title && <div className="font-semibold">{title}</div>}
        <div className={title ? 'mt-0.5 text-muted' : ''}>{children}</div>
      </div>
    </div>
  );
}
