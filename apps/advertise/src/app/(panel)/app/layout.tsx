import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/panel/Sidebar';
import { CURRENT_TERMS_VERSION } from '@/content/legal';
import { PANEL } from '@/lib/i18n';
import { panelLocale, panelTheme, requireAdvertiser } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ user, org }, lang, theme] = await Promise.all([requireAdvertiser(), panelLocale(), panelTheme()]);
  // Turned on once the lawyer-approved terms are published; until then drafts are not binding.
  if (process.env.TERMS_REQUIRED === 'true' && user.termsAcceptedVersion !== CURRENT_TERMS_VERSION) redirect('/accept-terms');
  return (
    <div className="lg:flex">
      <Sidebar t={PANEL[lang].nav} lang={lang} theme={theme} company={org.name} userName={user.name} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
