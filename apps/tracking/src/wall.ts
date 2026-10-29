import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sign, verify } from '@kiqro/core';
import type { Db } from '@kiqro/db';
import { fileClaim, listOffers, type Offer } from '@kiqro/network';

/**
 * Hosted offerwall: a mobile web page publishers open in a WebView (or browser) instead of
 * building their own UI. Same signed URL as the Offers API:
 *   /wall?app_key&user_id&sig[&risk][&lang=en|tr]   sig = HMAC(secret, app_key|user_id[|risk])
 * Server-rendered without JavaScript; every value is HTML-escaped and a strict CSP is set.
 */

type Query = Record<string, string | undefined>;

const T = {
  en: {
    title: 'Earn rewards',
    available: 'Available',
    started: 'In progress',
    done: 'Completed',
    start: 'Start',
    continue: 'Continue',
    days: (n: number) => `${n} day${n === 1 ? '' : 's'}`,
    empty: 'No offers right now. Check back soon.',
    states: { open: '', credited: 'Rewarded', in_review: 'In review', rejected: 'Not rewarded', reversed: 'Reversed' } as Record<string, string>,
    missing: 'Completed a step but no reward?',
    claim: 'Report missing reward',
    note: 'What did you do, and when?',
    claimed: 'Thanks — we have passed your report to the advertiser. Decisions usually take 3–7 days.',
    claimFailed: 'We could not file this report.',
    footer: 'Offers by Kiqro Network. Rewards are credited by',
  },
  tr: {
    title: 'Ödül kazan',
    available: 'Mevcut',
    started: 'Devam eden',
    done: 'Tamamlanan',
    start: 'Başla',
    continue: 'Devam et',
    days: (n: number) => `${n} gün`,
    empty: 'Şu anda teklif yok. Daha sonra tekrar bakın.',
    states: { open: '', credited: 'Ödüllendirildi', in_review: 'İnceleniyor', rejected: 'Ödül verilmedi', reversed: 'Geri alındı' },
    missing: 'Bir adımı tamamladınız ama ödül gelmedi mi?',
    claim: 'Eksik ödülü bildir',
    note: 'Ne yaptınız, ne zaman?',
    claimed: 'Teşekkürler, bildiriminizi reklamverene ilettik. Karar genelde 3–7 gün sürer.',
    claimFailed: 'Bildirim oluşturulamadı.',
    footer: 'Teklifler Kiqro Network tarafından sağlanır. Ödülleri veren:',
  },
};

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (s: string, lang: string) => new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US').format(Number(s));

const CSS = `
:root{--bg:#0b0a14;--card:#16142a;--line:#26233d;--fg:#f4f3ff;--muted:#a7a3c2;--accent:#6c57f0;--good:#34d399;--warn:#fbbf24}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,'Segoe UI',Roboto,sans-serif}
header{position:sticky;top:0;background:rgba(11,10,20,.92);backdrop-filter:blur(8px);padding:14px 16px;border-bottom:1px solid var(--line);z-index:2}
h1{margin:0;font-size:19px}nav{display:flex;gap:6px;margin-top:10px}nav a{padding:6px 12px;border-radius:999px;color:var(--muted);text-decoration:none;font-size:13px;border:1px solid var(--line)}nav a.on{background:var(--accent);border-color:var(--accent);color:#fff}
main{padding:12px 16px 32px;display:grid;gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px}
.top{display:flex;gap:12px;align-items:center}.icon{width:56px;height:56px;border-radius:14px;object-fit:cover;background:#2a2745;flex:none}
.t{font-weight:600}.d{color:var(--muted);font-size:13px;margin-top:2px}.reward{margin-left:auto;text-align:right;font-weight:700;color:var(--warn);white-space:nowrap}.reward small{display:block;color:var(--muted);font-weight:400;font-size:11px}
ol{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px}li{display:flex;gap:8px;align-items:center;font-size:13px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03)}
li .p{margin-left:auto;font-weight:600;white-space:nowrap}li .s{font-size:11px;padding:2px 7px;border-radius:999px;background:#2a2745;color:var(--muted)}li.credited .s{background:rgba(52,211,153,.15);color:var(--good)}
.btn{display:block;margin-top:12px;text-align:center;padding:11px;border-radius:12px;background:var(--accent);color:#fff;font-weight:600;text-decoration:none;border:0;width:100%;font-size:15px}
details{margin-top:10px;font-size:13px;color:var(--muted)}summary{cursor:pointer}form{display:grid;gap:8px;margin-top:8px}select,textarea{width:100%;padding:9px;border-radius:10px;border:1px solid var(--line);background:#0f0e1c;color:var(--fg);font:inherit}
.btn2{padding:9px;border-radius:10px;border:1px solid var(--accent);background:transparent;color:var(--fg);font:inherit}
.empty,.msg{color:var(--muted);text-align:center;padding:32px 8px}.msg.ok{color:var(--good)}footer{color:var(--muted);font-size:11px;text-align:center;padding:0 16px 24px}`;

function offerCard(o: Offer, t: (typeof T)['en'], lang: string, currency: string, base: string, hidden: string): string {
  const steps = o.tasks
    .map(
      (s) => `<li class="${esc(s.state)}"><span>${esc(s.seq)}. ${esc(s.name)} <span class="d">· ${esc(t.days(s.timeLimitDays))}</span></span>
        ${t.states[s.state] ? `<span class="s">${esc(t.states[s.state])}</span>` : ''}<span class="p">+${esc(num(s.rewardPoints, lang))}</span></li>`,
    )
    .join('');
  const claimable = o.started ? o.tasks.filter((s) => s.state === 'open' || s.state === 'rejected') : [];
  const claim = claimable.length
    ? `<details><summary>${esc(t.missing)}</summary><form method="post" action="${esc(base)}/wall/claim">${hidden}
        <input type="hidden" name="offer_id" value="${esc(o.offerId)}">
        <select name="task_id">${claimable.map((s) => `<option value="${esc(s.taskId)}">${esc(s.seq)}. ${esc(s.name)}</option>`).join('')}</select>
        <textarea name="note" rows="2" maxlength="500" placeholder="${esc(t.note)}"></textarea>
        <button class="btn2" type="submit">${esc(t.claim)}</button></form></details>`
    : '';
  return `<section class="card"><div class="top">
      ${o.iconUrl ? `<img class="icon" src="${esc(o.iconUrl)}" alt="" referrerpolicy="no-referrer">` : '<div class="icon"></div>'}
      <div><div class="t">${esc(o.title)}</div><div class="d">${esc(o.description)}</div></div>
      <div class="reward">+${esc(num(o.totalRewardPoints, lang))}<small>${esc(currency)}</small></div></div>
      <ol>${steps}</ol>
      ${o.completed ? '' : `<a class="btn" href="${esc(o.clickUrl)}" target="_blank" rel="noopener">${esc(o.started ? t.continue : t.start)}</a>`}
      ${claim}</section>`;
}

function page(lang: string, title: string, body: string): string {
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

const CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors *";

export function registerWall(app: FastifyInstance, db: Db, trackingBaseUrl: string, countryOf: (req: FastifyRequest) => string | null): void {
  app.get<{ Querystring: Query }>('/wall', async (req, reply) => {
    const lang = req.query.lang === 'tr' ? 'tr' : 'en';
    const t = T[lang];
    const tab = ['started', 'done'].includes(req.query.tab ?? '') ? req.query.tab! : 'available';
    const result = await listOffers(db, {
      appKey: req.query.app_key ?? '',
      publisherUserId: req.query.user_id ?? '',
      signature: req.query.sig,
      // Cloudflare's country; the publisher's ?country= as a fallback (as in the Offers API).
      country: countryOf(req) ?? (/^[A-Z]{2}$/.test(req.query.country?.toUpperCase() ?? '') ? req.query.country!.toUpperCase() : null),
      lang,
      trackingBaseUrl,
      publisherRisk: req.query.risk,
    });
    reply.header('content-security-policy', CSP).header('cache-control', 'no-store').header('referrer-policy', 'no-referrer').type('text/html; charset=utf-8');
    if (!result.ok) return reply.code(result.status).send(page(lang, t.title, `<div class="empty">${esc(result.reason)}</div>`));

    const placement = result.placement;
    const keep = new URLSearchParams({ app_key: req.query.app_key!, user_id: req.query.user_id!, sig: req.query.sig!, lang, ...(req.query.risk ? { risk: req.query.risk } : {}), ...(req.query.country ? { country: req.query.country } : {}) });
    const hidden = [...keep].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
    const groups = {
      available: result.offers.filter((o) => !o.started),
      started: result.offers.filter((o) => o.started && !o.completed),
      done: result.offers.filter((o) => o.completed),
    };
    const list = groups[tab as keyof typeof groups];
    const tabLink = (key: keyof typeof groups, label: string) => `<a class="${tab === key ? 'on' : ''}" href="?${esc(new URLSearchParams({ ...Object.fromEntries(keep), tab: key }).toString())}">${esc(label)} · ${groups[key].length}</a>`;
    const notice = req.query.claimed === '1' ? `<div class="msg ok">${esc(t.claimed)}</div>` : req.query.claimed === '0' ? `<div class="msg">${esc(t.claimFailed)}</div>` : '';
    const base = trackingBaseUrl.replace(/\/$/, '');
    const body = `<header><h1>${esc(t.title)}</h1><nav>${tabLink('available', t.available)}${tabLink('started', t.started)}${tabLink('done', t.done)}</nav></header>
      <main>${notice}${list.length ? list.map((o) => offerCard(o, t, lang, placement.currencyName, base, hidden)).join('') : `<div class="empty">${esc(t.empty)}</div>`}</main>
      <footer>${esc(t.footer)} ${esc(placement.publisherName)}</footer>`;
    return reply.send(page(lang, t.title, body));
  });

  /** Claim form of the hosted wall: the wall's own signature proves who the user is. */
  app.post<{ Body: Query | undefined }>('/wall/claim', async (req, reply) => {
    const b = req.body ?? {};
    const appKey = b.app_key ?? '';
    const userId = b.user_id ?? '';
    const placement = await db.query.placements.findFirst({ where: (p, { eq }) => eq(p.appKey, appKey) });
    const parts = b.risk ? [appKey, userId, b.risk] : [appKey, userId];
    let ok = false;
    if (placement && verify(placement.secret, parts, b.sig ?? '')) {
      const result = await fileClaim(db, {
        appKey,
        publisherUserId: userId,
        campaignId: b.offer_id ?? '',
        taskId: b.task_id ?? '',
        note: b.note,
        signature: sign(placement.secret, [appKey, userId, b.offer_id ?? '', b.task_id ?? '']),
      });
      ok = result.ok;
    }
    const back = new URLSearchParams({ app_key: appKey, user_id: userId, sig: b.sig ?? '', lang: b.lang === 'tr' ? 'tr' : 'en', tab: 'started', claimed: ok ? '1' : '0', ...(b.risk ? { risk: b.risk } : {}), ...(b.country ? { country: b.country } : {}) });
    return reply.redirect(`/wall?${back.toString()}`, 303);
  });
}
