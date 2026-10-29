import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PANEL } from '@/lib/i18n';
import { currentAdvertiser, panelLocale } from '@/lib/session';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await currentAdvertiser()) redirect('/app');
  const lang = await panelLocale();
  const t = PANEL[lang].login;

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-5">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="absolute top-1/4 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-violet-500/20 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href={`/${lang}`}>
            <Logo />
          </Link>
        </div>
        <div className="glass rounded-2xl p-7 shadow-[0_30px_100px_-30px_rgb(0_0_0/0.6)]">
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.sub}</p>
          <LoginForm t={t} />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          {t.noAccount}{' '}
          <Link href={`/${lang}#demo`} className="font-medium text-violet-400 hover:text-violet-300">
            {t.demo}
          </Link>
        </p>
      </div>
    </main>
  );
}
