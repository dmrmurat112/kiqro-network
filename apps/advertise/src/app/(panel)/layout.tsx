import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { panelLocale, panelTheme } from '@/lib/session';
import '../globals.css';

export const metadata: Metadata = { title: 'Kiqro Network — Advertiser', robots: { index: false } };

export default async function PanelRootLayout({ children }: { children: React.ReactNode }) {
  const [lang, theme] = await Promise.all([panelLocale(), panelTheme()]);
  return (
    <html lang={lang} data-theme={theme} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-bg text-fg">{children}</body>
    </html>
  );
}
