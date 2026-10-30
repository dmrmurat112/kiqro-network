import Link from 'next/link';
import { LEGAL_DOCS } from '@/content/legal';
import type { Locale, SiteDict } from '@/lib/i18n';
import { Logo } from '../Logo';

export function SiteFooter({ lang, t }: { lang: Locale; t: SiteDict }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted">{t.footer.tagline}</p>
        </div>
        <div className="text-sm">
          <div className="font-semibold">{t.footer.product}</div>
          <ul className="mt-4 space-y-2.5 text-muted">
            <li><a href={`/${lang}#how`} className="hover:text-fg">{t.nav.how}</a></li>
            <li><a href={`/${lang}#fraud`} className="hover:text-fg">{t.nav.fraud}</a></li>
            <li><a href={`/${lang}#pricing`} className="hover:text-fg">{t.nav.pricing}</a></li>
            <li><Link href="/login" className="hover:text-fg">{t.nav.login}</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <div className="font-semibold">{t.footer.legal}</div>
          <ul className="mt-4 space-y-2.5 text-muted">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug}>
                <Link href={`/${lang}/legal/${d.slug}`} className="hover:text-fg">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-sm">
          <div className="font-semibold">{t.footer.company}</div>
          <ul className="mt-4 space-y-2.5 text-muted">
            <li><a href="https://kiqro.com" className="hover:text-fg">{t.footer.users}</a></li>
            <li><a href="mailto:contact@kiqro.com" className="hover:text-fg">{t.footer.contact}: contact@kiqro.com</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-6 text-center text-xs text-subtle">{t.footer.rights}</div>
    </footer>
  );
}
