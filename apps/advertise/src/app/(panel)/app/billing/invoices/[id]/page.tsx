import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { invoiceDocument } from '@kiqro/network/advertiser';
import { ENTITY } from '@/content/legal/entity';
import { db } from '@/lib/db';
import { countryName } from '@/lib/format';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiser } from '@/lib/session';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

const money = (micros: bigint, lang: string) =>
  new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: 'USD' }).format(Number(micros) / 1e6);
const day = (d: Date, lang: string) => new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
const month = (d: Date, lang: string) => new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

/**
 * Printable invoice. "Download PDF" uses the browser's print-to-PDF, so the document is the
 * same on screen and on paper; the panel chrome is hidden when printing (globals.css).
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ org: sessionOrg }, lang, { id }] = await Promise.all([requireAdvertiser(), panelLocale(), params]);
  const doc = await invoiceDocument(db, sessionOrg.id, id);
  if (!doc) notFound();
  const { invoice, org } = doc;
  const t = PANEL[lang].billing.doc;
  const entity = invoice.billingEntity === 'kiqro_oy' ? { ...ENTITY, name: 'Kiqro Oy' } : ENTITY;
  // The invoice covers the debt; spend in the period may be partly covered by prepaid money,
  // or the debt may include unpaid amounts from before the period.
  const adjustment = invoice.amount - invoice.periodSpend;
  const due = invoice.amount - invoice.amountPaid;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <Link href="/app/billing" className="flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft size={15} /> {t.back}
        </Link>
        <PrintButton label={t.print} />
      </div>

      <article className="invoice-paper rounded-2xl bg-white p-8 text-[#16142a] shadow-xl sm:p-12">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-2xl font-bold tracking-tight">
              <span className="text-[#6c57f0]">K</span> kiqro <span className="ml-1 align-middle text-[0.6rem] font-semibold tracking-[0.2em] text-[#8d88a8]">NETWORK</span>
            </div>
            <h1 className="mt-6 flex items-center gap-3 text-3xl font-semibold tracking-tight">
              {t.title}
              {invoice.status === 'paid' && (
                <span className="-rotate-6 rounded-md border-2 border-emerald-500 px-2 py-0.5 text-xs font-bold tracking-[0.2em] text-emerald-600 uppercase">{t.paidStamp}</span>
              )}
            </h1>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-[#8d88a8]">{t.number}</dt>
            <dd className="text-right font-mono font-semibold">{invoice.number}</dd>
            <dt className="text-[#8d88a8]">{t.issued}</dt>
            <dd className="text-right">{day(invoice.issuedAt, lang)}</dd>
            <dt className="text-[#8d88a8]">{t.due}</dt>
            <dd className="text-right font-semibold">{day(invoice.dueAt, lang)}</dd>
            <dt className="text-[#8d88a8]">{t.period}</dt>
            <dd className="text-right capitalize">{month(invoice.periodStart, lang)}</dd>
          </dl>
        </header>

        <section className="mt-10 grid gap-8 text-sm sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold tracking-wider text-[#8d88a8] uppercase">{t.from}</div>
            <div className="font-semibold">{entity.name}</div>
            <div className="whitespace-pre-line text-[#5c5878]">{entity.address}</div>
            <div className="text-[#5c5878]">{entity.registration}</div>
            <div className="text-[#5c5878]">{entity.salesEmail}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold tracking-wider text-[#8d88a8] uppercase">{t.billTo}</div>
            <div className="font-semibold">{org.legalName ?? org.name}</div>
            {org.billingAddress && <div className="whitespace-pre-line text-[#5c5878]">{org.billingAddress}</div>}
            {org.country && <div className="text-[#5c5878]">{countryName(org.country, lang)}</div>}
            {org.vatId && (
              <div className="text-[#5c5878]">
                {t.vat}: <span className="font-mono">{org.vatId}</span>
              </div>
            )}
          </div>
        </section>

        <table className="mt-10 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[#16142a] text-left">
              <th className="pb-2 font-semibold">{t.description}</th>
              <th className="pb-2 text-right font-semibold">{t.amount}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#e7e4f3]">
              <td className="py-3">
                {t.service}
                <div className="text-xs text-[#8d88a8] capitalize">{month(invoice.periodStart, lang)}</div>
              </td>
              <td className="py-3 text-right font-mono tabular-nums">{money(invoice.periodSpend, lang)}</td>
            </tr>
            {adjustment !== 0n && (
              <tr className="border-b border-[#e7e4f3]">
                <td className="py-3">{adjustment < 0n ? t.prepaid : t.carried}</td>
                <td className="py-3 text-right font-mono tabular-nums">{money(adjustment, lang)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-6 ml-auto grid max-w-xs gap-2 text-sm">
          <Row label={t.subtotal} value={money(invoice.amount, lang)} />
          <Row label={t.tax} value={<span className="text-xs text-[#8d88a8]">{t.taxNote}</span>} />
          <div className="my-1 border-t border-[#e7e4f3]" />
          <Row label={t.total} value={money(invoice.amount, lang)} strong />
          {invoice.amountPaid > 0n && <Row label={t.paid} value={money(-invoice.amountPaid, lang)} />}
          <div className="mt-1 flex items-center justify-between rounded-xl bg-[#f1effa] px-4 py-3">
            <span className="font-semibold">{t.balance}</span>
            <span className="font-mono text-lg font-semibold tabular-nums">{money(due, lang)}</span>
          </div>
        </div>

        <section className="mt-10 border-t border-[#e7e4f3] pt-6 text-sm text-[#5c5878]">
          <div className="mb-1.5 font-semibold text-[#16142a]">{t.howToPay}</div>
          <p>{t.payCard}</p>
          <p>{t.payBank}</p>
        </section>

        <footer className="mt-10 flex flex-wrap justify-between gap-2 text-xs text-[#8d88a8]">
          <span>
            {entity.name} · {entity.website}
          </span>
          <span>{t.draft}</span>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? 'font-semibold' : 'text-[#5c5878]'}>{label}</span>
      <span className={`text-right font-mono tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}
