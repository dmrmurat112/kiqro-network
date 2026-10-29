import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LegalArticle } from '@/components/site/LegalArticle';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteNav } from '@/components/site/SiteNav';
import { LEGAL_DOCS, legalDoc } from '@/content/legal';
import { isLocale, LOCALES, SITE } from '@/lib/i18n';

export function generateStaticParams() {
  return LOCALES.flatMap((lang) => LEGAL_DOCS.map((d) => ({ lang, doc: d.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; doc: string }> }): Promise<Metadata> {
  const { doc: slug } = await params;
  const doc = legalDoc(slug);
  // Drafts are not binding, so keep them out of search results until legal review is done.
  return doc ? { title: `${doc.title} — Kiqro Network`, description: doc.summary, robots: doc.status === 'draft' ? { index: false } : undefined } : {};
}

export default async function LegalPage({ params }: { params: Promise<{ lang: string; doc: string }> }) {
  const { lang, doc: slug } = await params;
  const doc = legalDoc(slug);
  if (!isLocale(lang) || !doc) notFound();
  const t = SITE[lang];

  return (
    <>
      <SiteNav lang={lang} t={t.nav} altHref={`/${lang === 'en' ? 'tr' : 'en'}/legal/${doc.slug}`} />
      <main className="mx-auto max-w-6xl px-5 pt-28 pb-24 lg:px-8">
        <Link href={`/${lang}/legal`} className="text-sm text-muted hover:text-fg">
          ← {t.legal.all}
        </Link>
        <div className="mt-6">
          <LegalArticle doc={doc} t={t.legal} />
        </div>
      </main>
      <SiteFooter lang={lang} t={t} />
    </>
  );
}
