import Link from 'next/link';
import { AuthShell } from '@/components/panel/AuthShell';
import { PANEL } from '@/lib/i18n';
import { panelLocale } from '@/lib/session';
import { ForgotForm } from './ForgotForm';

export default async function ForgotPasswordPage() {
  const lang = await panelLocale();
  const t = PANEL[lang].forgot;
  return (
    <AuthShell
      homeHref={`/${lang}`}
      below={
        <Link href="/login" className="hover:text-fg">
          ← {t.back}
        </Link>
      }
    >
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.sub}</p>
      <ForgotForm t={t} emailLabel={PANEL[lang].login.email} />
    </AuthShell>
  );
}
