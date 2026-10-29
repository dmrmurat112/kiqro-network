import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaignForm } from '@kiqro/network/admin';
import { ActionForm } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { db } from '@/lib/db';
import { dateTime, usd } from '@/lib/format';
import { approveCampaignAction, duplicateCampaignAction, returnCampaignAction, setStatusAction, updateCampaignAction } from '../actions';
import { CampaignForm } from '../CampaignForm';

export const dynamic = 'force-dynamic';

const ACTIONS: Record<string, { to: string; label: string; danger?: boolean }[]> = {
  draft: [{ to: 'active', label: 'Aktif et' }, { to: 'archived', label: 'Arşivle', danger: true }],
  // Self-serve submissions are approved or returned with a note (review card below).
  in_review: [],
  active: [{ to: 'paused', label: 'Duraklat' }, { to: 'completed', label: 'Bitir', danger: true }],
  paused: [{ to: 'active', label: 'Devam ettir' }, { to: 'completed', label: 'Bitir', danger: true }],
  completed: [{ to: 'archived', label: 'Arşivle' }],
  archived: [],
};

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCampaignForm(db, id);
  if (!data) notFound();
  const { campaign, form, hasClicks, spend } = data;

  return (
    <>
      <div className="row spread">
        <h1>{campaign.name}</h1>
        <div className="row">
          <Badge status={campaign.status} />
          {ACTIONS[campaign.status]!.map((a) => (
            <ActionForm key={a.to} action={setStatusAction.bind(null, id)} submitLabel={a.label} className="row" buttonClass={a.danger ? 'danger small' : 'small'} confirm={`Kampanya durumu "${a.label}" olarak değişecek. Emin misiniz?`}>
              <input type="hidden" name="status" value={a.to} />
            </ActionForm>
          ))}
          <ActionForm action={duplicateCampaignAction.bind(null, id)} submitLabel="Kopyala" className="row" buttonClass="secondary small" />
        </div>
      </div>
      {campaign.status === 'in_review' && (
        <div className="card" style={{ borderColor: '#e0b46a', background: '#fffaf0' }}>
          <h2>Reklamveren incelemeye gönderdi</h2>
          <p className="muted">
            Gönderim: {dateTime(campaign.submittedAt)}. Takip linkini (test tıklaması + test postback), MMP olay adlarını, süreleri, fiyatları ve reklam politikasını kontrol edin.
          </p>
          <div className="grid cols-2">
            <ActionForm action={approveCampaignAction.bind(null, id)} submitLabel="Onayla ve yayına al" confirm="Kampanya hemen yayına girecek. Emin misiniz?">
              <p className="muted">Reklamverene "kampanyanız yayında" e-postası gider.</p>
            </ActionForm>
            <ActionForm action={returnCampaignAction.bind(null, id)} submitLabel="Notla geri gönder" buttonClass="secondary">
              <label>
                Reklamverene not (ne değişmeli?)
                <textarea name="note" rows={3} required />
              </label>
            </ActionForm>
          </div>
        </div>
      )}
      {campaign.status === 'draft' && campaign.reviewNote && (
        <p className="notice info">Son geri gönderme notu: {campaign.reviewNote}</p>
      )}
      <div className="grid cols-4">
        <div className="card stat">
          <div className="value">{usd(spend)}</div>
          <div className="label">Harcama</div>
        </div>
        <div className="card stat">
          <div className="value">{usd(campaign.totalBudget)}</div>
          <div className="label">Toplam bütçe</div>
        </div>
        <div className="card stat">
          <div className="value">{campaign.countries.join(', ')}</div>
          <div className="label">Ülkeler</div>
        </div>
        <div className="card stat">
          <div className="value">
            <Link href={`/conversions?campaignId=${id}`}>Dönüşümler →</Link>
          </div>
          <div className="label">Bu kampanyanın dönüşüm kayıtları</div>
        </div>
      </div>
      <CampaignForm action={updateCampaignAction.bind(null, id)} submitLabel="Değişiklikleri kaydet" initial={form} tasksLocked={hasClicks} />
    </>
  );
}
