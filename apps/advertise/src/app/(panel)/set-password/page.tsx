import Link from 'next/link';
import { inspectPasswordToken } from '@kiqro/network/advertiser';
import { AuthShell } from '@/components/panel/AuthShell';
import { db } from '@/lib/db';
import { isLocale, PANEL } from '@/lib/i18n';
import { panelLocale } from '@/lib/session';
import { SetPasswordForm } from './SetPasswordForm';

export const dynamic = 'force-dynamic';

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const info = token ? await inspectPasswordToken(db, token) : null;
  // The invited user's own language when the link is valid; otherwise the browser's preference.
  const lang = info && isLocale(info.locale) ? info.locale : await panelLocale();
  const t = PANEL[lang].setPassword;

  return (
    <AuthShell homeHref={`/${lang}`}>
      {!info ? (
        <>
          <h1 className="text-xl font-semibold">{t.resetTitle}</h1>
          <p className="mt-4 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{t.invalid}</p>
          <Link href="/forgot-password" className="btn-primary mt-5 w-full justify-center">
            {t.requestNew}
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">{info.purpose === 'invite' ? t.inviteTitle : t.resetTitle}</h1>
          <p className="mt-1 text-sm text-muted">
            {t.for}: <span className="text-fg">{info.email}</span>
          </p>
          <SetPasswordForm token={token} t={t} email={info.email} />
        </>
      )}
    </AuthShell>
  );
}
