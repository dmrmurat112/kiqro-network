'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { Locale, SiteDict } from '@/lib/i18n';
import { Logo } from '../Logo';

export function SiteNav({ lang, t }: { lang: Locale; t: SiteDict['nav'] }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { href: '#how', label: t.how },
    { href: '#why', label: t.why },
    { href: '#fraud', label: t.fraud },
    { href: '#pricing', label: t.pricing },
    { href: '#faq', label: t.faq },
  ];
  const other = lang === 'en' ? 'tr' : 'en';

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled || open ? 'border-b border-line bg-bg/75 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link href={`/${lang}`} aria-label="Kiqro Network">
          <Logo />
        </Link>
        <div className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-fg">
              {l.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href={`/${other}`} className="rounded-lg px-2.5 py-2 text-xs font-semibold uppercase tracking-wider text-subtle hover:text-fg">
            {other}
          </Link>
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-fg">
            {t.login}
          </Link>
          <a href="#demo" className="btn-primary !py-2 text-sm">
            {t.demo}
          </a>
        </div>
        <button className="rounded-lg p-2 text-muted lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-line px-5 pb-5 lg:hidden">
          <div className="flex flex-col py-2">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-2.5 text-muted hover:text-fg">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <a href="#demo" onClick={() => setOpen(false)} className="btn-primary flex-1 justify-center">
              {t.demo}
            </a>
            <Link href="/login" className="btn-ghost">
              {t.login}
            </Link>
            <Link href={`/${other}`} className="btn-ghost uppercase">
              {other}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
