import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, FileText } from 'lucide-react';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteNav } from '@/components/site/SiteNav';
import { LEGAL_DOCS } from '@/content/legal';
import { isLocale, SITE } from '@/lib/i18n';

export const metadata = { robots: { index: false } };

export default async function LegalIndex({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = SITE[lang];

  return (
    <>
      <SiteNav lang={lang} t={t.nav} altHref={`/${lang === 'en' ? 'tr' : 'en'}/legal`} />
      <main className="mx-auto max-w-4xl px-5 pt-28 pb-24 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.legal.title}</h1>
        <p className="mt-3 text-muted">{t.legal.sub}</p>
        <ul className="mt-10 grid gap-3">
          {LEGAL_DOCS.map((d) => (
            <li key={d.slug}>
              <Link href={`/${lang}/legal/${d.slug}`} className="card-glow group flex items-center gap-4 rounded-2xl p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300">
                  <FileText size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {d.title}
                    {d.status === 'draft' && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[0.7rem] font-medium text-warn">draft</span>}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{d.summary}</span>
                </span>
                <ArrowRight size={18} className="text-subtle transition-transform group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter lang={lang} t={t} />
    </>
  );
}
