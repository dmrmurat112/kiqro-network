import { Card, PageHeader } from '@/components/panel/ui';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requireAdvertiser } from '@/lib/session';
import { BillingDetailsForm } from './BillingDetailsForm';
import { PasswordForm } from './PasswordForm';
import { TwoFactorCard } from './TwoFactorCard';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const [{ org, user }, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const t = PANEL[lang].account;
  const entity = org.billingEntity === 'kiqro_oy' ? 'Kiqro Oy' : 'Kiqro Inc.';

  return (
    <>
      <PageHeader title={t.title} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <dl className="grid gap-5 text-sm">
            <div>
              <dt className="text-subtle">{t.company}</dt>
              <dd className="mt-1 font-semibold">{org.name}</dd>
            </div>
            <div>
              <dt className="text-subtle">{t.you}</dt>
              <dd className="mt-1">
                {user.name} · <span className="text-muted">{user.email}</span>
              </dd>
            </div>
            <div>
              <dt className="text-subtle">{t.invoice}</dt>
              <dd className="mt-1">
                {entity} · {org.invoiceCurrency}
              </dd>
            </div>
          </dl>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">{t.password}</h2>
          <PasswordForm t={t} />
        </Card>
      </div>
      <Card className="mt-4 p-6">
        <h2 className="mb-4 font-semibold">{t.twofaTitle}</h2>
        <TwoFactorCard t={t} enabled={Boolean(user.totpEnabledAt)} />
      </Card>
      <Card className="mt-4 p-6">
        <div id="billing-details" className="mb-5 scroll-mt-8">
          <h2 className="font-semibold">{t.billingTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.billingSub}</p>
        </div>
        <BillingDetailsForm
          t={t}
          values={{ legalName: org.legalName ?? org.name, billingAddress: org.billingAddress ?? '', vatId: org.vatId ?? '', billingEmail: org.billingEmail ?? '' }}
        />
      </Card>
    </>
  );
}
