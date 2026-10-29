import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { AuthShell } from '@/components/panel/AuthShell';
import { CURRENT_TERMS_VERSION, legalDoc } from '@/content/legal';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiser } from '@/lib/session';
import { AcceptForm } from './AcceptForm';

export const dynamic = 'force-dynamic';

const DOCS = ['terms', 'dpa', 'ad-policy', 'privacy'] as const;

export default async function AcceptTermsPage() {
  const [{ user }, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  if (user.termsAcceptedVersion === CURRENT_TERMS_VERSION) redirect('/app');
  const t = PANEL[lang].terms;

  return (
    <AuthShell homeHref={`/${lang}`}>
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.sub}</p>
      <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-subtle">{t.docs}</div>
      <ul className="mt-2 grid gap-1.5">
        {DOCS.map((slug) => {
          const doc = legalDoc(slug)!;
          return (
            <li key={slug}>
              <Link href={`/${lang}/legal/${slug}`} target="_blank" className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:border-violet-400/50">
                {doc.title}
                <ExternalLink size={14} className="text-subtle" />
              </Link>
            </li>
          );
        })}
      </ul>
      <AcceptForm t={t} />
    </AuthShell>
  );
}
