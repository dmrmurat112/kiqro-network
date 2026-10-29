import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Kiqro Network Admin', robots: { index: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
