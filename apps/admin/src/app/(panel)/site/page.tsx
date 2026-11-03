import { loadSiteContent, siteTextEntries, type SiteTextEntry } from '@kiqro/network/site';
import { ActionForm } from '@/components/ActionForm';
import { db } from '@/lib/db';
import { saveSiteTextsAction, setSiteThemeAction } from './actions';

export const dynamic = 'force-dynamic';

const SECTIONS: Record<string, string> = {
  meta: 'Arama motoru (sayfa başlığı ve açıklaması)',
  nav: 'Üst menü',
  hero: 'Giriş bölümü ve sayılar',
  mockup: 'Örnek kampanya kartı',
  mmps: 'MMP şeridi',
  how: 'Nasıl çalışır',
  why: 'Neden Kiqro',
  fraud: 'Fraud koruması',
  pricing: 'Fiyatlandırma',
  faq: 'Sık sorulan sorular',
  demo: 'Demo formu',
  footer: 'Alt bilgi',
  legal: 'Hukuki sayfalar',
};

const siteUrl = process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200';

/** "hero.stats.0.value" → "stats 1 · value" (shown without the section name). */
const fieldLabel = (path: string) =>
  path
    .split('.')
    .slice(1)
    .map((part) => (/^\d+$/.test(part) ? String(Number(part) + 1) : part))
    .join(' · ');

const rows = (text: string) => Math.min(6, Math.max(1, Math.ceil(text.length / 70)));

export default async function SitePage() {
  const content = await loadSiteContent(db);
  const sections = new Map<string, SiteTextEntry[]>();
  for (const entry of siteTextEntries()) {
    const section = entry.path.split('.')[0]!;
    sections.set(section, [...(sections.get(section) ?? []), entry]);
  }

  return (
    <>
      <div className="row spread">
        <h1>Site içeriği</h1>
        <a className="button secondary" href={`${siteUrl}/tr`} target="_blank" rel="noreferrer">
          Siteyi aç ↗
        </a>
      </div>
      <p className="muted">
        kiqronetwork.com ana sayfasındaki bütün metin ve sayılar (TR ve EN). Bir alanı boş bırakırsanız varsayılan metin kullanılır. Kaydedilen değişiklikler 30 saniye
        içinde sitede görünür.
      </p>

      <div className="card">
        <h2>Varsayılan tema</h2>
        <p className="muted">Ziyaretçi menüdeki düğmeyle temayı kendisi değiştirebilir; seçimi tarayıcısında saklanır. Bu ayar, seçim yapmamış ziyaretçiler içindir ve reklamveren paneli için de geçerlidir.</p>
        <ActionForm action={setSiteThemeAction} submitLabel="Kaydet" className="row">
          <select name="theme" defaultValue={content.defaultTheme} style={{ width: 'auto' }}>
            <option value="light">Açık</option>
            <option value="dark">Koyu</option>
          </select>
        </ActionForm>
      </div>

      {[...sections].map(([section, entries]) => {
        const edited = entries.filter((e) => content.texts[e.path]).length;
        return (
          <details key={section} className="card">
            <summary className="row spread" style={{ cursor: 'pointer' }}>
              <strong>{SECTIONS[section] ?? section}</strong>
              <span className="muted">
                {entries.length} alan{edited ? ` · ${edited} düzenlendi` : ''}
              </span>
            </summary>
            <ActionForm action={saveSiteTextsAction} submitLabel="Bu bölümü kaydet">
              <div className="copy-head">
                <span />
                <span>English</span>
                <span>Türkçe</span>
              </div>
              {entries.map((e) => {
                const override = content.texts[e.path] ?? {};
                const en = override.en ?? e.en;
                const tr = override.tr ?? e.tr;
                return (
                  <div key={e.path} className="copy-row">
                    <div className="copy-label">
                      {fieldLabel(e.path)}
                      {(override.en || override.tr) && <span className="badge in_review">düzenlendi</span>}
                    </div>
                    <textarea name={`en:${e.path}`} defaultValue={en} placeholder={e.en} rows={rows(en)} />
                    <textarea name={`tr:${e.path}`} defaultValue={tr} placeholder={e.tr} rows={rows(tr)} />
                  </div>
                );
              })}
            </ActionForm>
          </details>
        );
      })}
    </>
  );
}
