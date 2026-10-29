import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { isLocale, LOCALES, SITE } from '@/lib/i18n';
import '../../globals.css';

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = SITE[lang].meta;
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
  return (
    <html lang={lang} data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-bg text-fg">{children}</body>
    </html>
  );
}
