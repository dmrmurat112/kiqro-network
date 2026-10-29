import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/panel/AuthShell';
import { PANEL } from '@/lib/i18n';
import { currentAdvertiser, panelLocale } from '@/lib/session';
import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  if (await currentAdvertiser()) redirect('/app');
  const [lang, sp] = await Promise.all([panelLocale(), searchParams]);
  const t = PANEL[lang].login;

  return (
    <AuthShell
      homeHref={`/${lang}`}
      below={
        <>
          {t.noAccount}{' '}
          <Link href={`/${lang}#demo`} className="font-medium text-violet-400 hover:text-violet-300">
            {t.demo}
          </Link>
        </>
      }
    >
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.sub}</p>
      {sp.password === 'set' && <p className="mt-4 rounded-lg bg-good/10 px-3 py-2 text-sm text-good">{t.passwordSet}</p>}
      <LoginForm t={t} />
      <div className="mt-4 text-center">
        <Link href="/forgot-password" className="text-sm text-muted hover:text-fg">
          {t.forgot}
        </Link>
      </div>
    </AuthShell>
  );
}
