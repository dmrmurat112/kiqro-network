import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { isLocale, LOCALES } from '@/lib/i18n';
import { siteCopy, siteTheme } from '@/lib/site';
import '../../globals.css';

// Rendered per request: texts and the default theme are edited in the admin panel.
export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = (await siteCopy(lang)).meta;
  return {
    title: t.title,
    description: t.description,
    alternates: { languages: { en: '/en', tr: '/tr' } },
    openGraph: { title: t.title, description: t.description, type: 'website', locale: lang === 'tr' ? 'tr_TR' : 'en_US' },
  };
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const theme = await siteTheme();
  return (
    <html lang={lang} data-theme={theme} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body data-site className="min-h-screen bg-bg text-fg">{children}</body>
    </html>
  );
}
