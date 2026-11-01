'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppWindow, Ban, Code2, CreditCard, LayoutDashboard, LifeBuoy, LogOut, Users, Megaphone, Menu, Moon, Plug, Sun, UserRound, X, ListChecks } from 'lucide-react';
import type { Locale, PanelDictT } from '@/lib/i18n';
import { logoutAction, setPreferenceAction } from '@/app/(panel)/actions';
import { Logo } from '../Logo';

interface Props {
  t: PanelDictT['nav'];
  lang: Locale;
  theme: 'dark' | 'light';
  company: string;
  userName: string;
  kind: 'advertiser' | 'publisher';
}

const ITEMS = [
  { href: '/app', key: 'overview', icon: LayoutDashboard },
  { href: '/app/campaigns', key: 'campaigns', icon: Megaphone },
  { href: '/app/conversions', key: 'conversions', icon: ListChecks },
  { href: '/app/claims', key: 'claims', icon: LifeBuoy },
  { href: '/app/integration', key: 'integration', icon: Plug },
  { href: '/app/billing', key: 'billing', icon: CreditCard },
  { href: '/app/team', key: 'team', icon: Users },
  { href: '/app/developers', key: 'developers', icon: Code2 },
  { href: '/app/account', key: 'account', icon: UserRound },
] as const;

/** Publishers (apps that show Kiqro offers) see their own pages and share Team and Account. */
const PUBLISHER_ITEMS = [
  { href: '/app/publisher', key: 'pubOverview', icon: LayoutDashboard },
  { href: '/app/publisher/placements', key: 'placements', icon: AppWindow },
  { href: '/app/publisher/conversions', key: 'pubConversions', icon: ListChecks },
  { href: '/app/publisher/integration', key: 'pubIntegration', icon: Plug },
  { href: '/app/publisher/bans', key: 'bans', icon: Ban },
  { href: '/app/team', key: 'team', icon: Users },
  { href: '/app/account', key: 'account', icon: UserRound },
] as const;

export function Sidebar({ t, lang, theme, company, userName, kind }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close on navigation and Escape; keep the page behind from scrolling while open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const home = kind === 'publisher' ? '/app/publisher' : '/app';
  const active = (href: string) => (href === home ? pathname === home : pathname.startsWith(href));
  const items = kind === 'publisher' ? PUBLISHER_ITEMS : ITEMS;

  const content = (
    <>
      <div className="px-3 pb-6">
        <Link href={home} onClick={() => setOpen(false)}>
          <Logo />
        </Link>
      </div>
      <div className="mx-3 mb-5 rounded-xl border border-line bg-surface px-3 py-2.5">
        <div className="truncate text-sm font-semibold">{company}</div>
        <div className="truncate text-xs text-subtle">{userName}</div>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {items.map(({ href, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active(href) ? 'bg-violet-500/15 text-fg' : 'text-muted hover:bg-surface-strong hover:text-fg'
            }`}
          >
            <Icon size={18} className={active(href) ? 'text-violet-400' : 'text-subtle group-hover:text-muted'} />
            {t[key]}
            {active(href) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400" />}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-1 border-t border-line px-3 pt-4">
        <form action={setPreferenceAction}>
          <input type="hidden" name="theme" value={theme === 'dark' ? 'light' : 'dark'} />
          <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-strong hover:text-fg" aria-label="Theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </form>
        <form action={setPreferenceAction}>
          <input type="hidden" name="lang" value={lang === 'en' ? 'tr' : 'en'} />
          <button className="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold uppercase text-muted hover:bg-surface-strong hover:text-fg" aria-label="Language">
            {lang === 'en' ? 'TR' : 'EN'}
          </button>
        </form>
        <form action={logoutAction} className="ml-auto">
          <button className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-surface-strong hover:text-fg">
            <LogOut size={16} /> {t.logout}
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-elevated py-6 lg:flex">{content}</aside>
      <div data-panel-chrome className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur-xl lg:hidden">
        <Logo tag="" />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted" aria-label="Menu">
          <Menu size={20} />
        </button>
      </div>
      {/* Mobile drawer: always mounted so it can slide in and out; inert while closed. */}
      <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} inert={!open} aria-hidden={!open}>
        <div className={`absolute inset-0 bg-black/55 transition-opacity duration-300 ease-out ${open ? 'opacity-100' : 'opacity-0'}`} onClick={() => setOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          className={`absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-line bg-elevated py-6 shadow-2xl transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button onClick={() => setOpen(false)} className="absolute top-5 right-4 grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-strong hover:text-fg" aria-label="Close">
            <X size={20} />
          </button>
          {content}
        </aside>
      </div>
    </>
  );
}
