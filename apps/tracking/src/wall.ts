import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sign, verify } from '@kiqro/core';
import type { Db } from '@kiqro/db';
import { fileClaim, listOffers, offerQueryOptions, type Offer, type PlacementInfo } from '@kiqro/network';

/**
 * Hosted offerwall: a mobile web page publishers open in a WebView, an iframe or a browser
 * instead of building their own UI. Same signed URL as the Offers API:
 *   /wall?app_key&user_id&sig[&risk][&lang=en|tr][&theme=light|dark][&offer=<id>][&platform][&category][&custom_1..5]
 *   sig = HMAC(secret, app_key|user_id[|risk])
 * The list shows one card per offer (banner, icon, step count, total reward); `offer` opens the
 * offer's page with its steps. Server-rendered without JavaScript; every value is HTML-escaped
 * and a strict CSP is set. Colours, logo and heading come from the placement's branding.
 */

type Query = Record<string, string | undefined>;

const T = {
  en: {
    title: 'Earn rewards',
    available: 'Offers',
    started: 'In progress',
    done: 'Completed',
    start: 'Start',
    continue: 'Continue',
    tasks: (n: number) => `${n} ${n === 1 ? 'step' : 'steps'}`,
    days: (n: number) => `within ${n} day${n === 1 ? '' : 's'}`,
    progress: (a: number, b: number) => `${a}/${b} done`,
    empty: { available: 'No offers right now', started: 'Nothing in progress yet', done: 'No completed offers yet' },
    emptySub: { available: 'New offers arrive often. Check back soon.', started: 'Start an offer and follow your progress here.', done: 'Offers you finish show up here.' },
    states: { open: '', credited: 'Rewarded', in_review: 'In review', rejected: 'Not rewarded', reversed: 'Reversed' } as Record<string, string>,
    isNew: 'New',
    top: 'Top reward',
    back: 'Back',
    steps: 'Steps',
    total: 'Total reward',
    how: 'How it works',
    howSteps: ['Tap the button and install the app from the store.', 'Complete each step within its time limit, using the same device.', 'Your reward is credited automatically after each step.'],
    missing: 'Completed a step but no reward?',
    claim: 'Report missing reward',
    note: 'What did you do, and when?',
    claimed: 'Thanks — we have passed your report to the advertiser. Decisions usually take 3–7 days.',
    claimFailed: 'We could not file this report.',
    footer: 'Offers by Kiqro Network',
    sale: (m: string, end: string) => `×${m} rewards on every offer you start until ${end}`,
    all: 'All',
    instructions: 'How to complete',
    screenshots: 'Screenshots',
    categories: { games: 'Games', finance: 'Finance', shopping: 'Shopping', entertainment: 'Entertainment', lifestyle: 'Lifestyle', utilities: 'Apps', other: 'Other' } as Record<string, string>,
  },
  tr: {
    title: 'Ödül kazan',
    available: 'Teklifler',
    started: 'Devam eden',
    done: 'Tamamlanan',
    start: 'Başla',
    continue: 'Devam et',
    tasks: (n: number) => `${n} görev`,
    days: (n: number) => `${n} gün içinde`,
    progress: (a: number, b: number) => `${a}/${b} tamamlandı`,
    empty: { available: 'Şu anda teklif yok', started: 'Devam eden teklif yok', done: 'Henüz tamamlanan teklif yok' },
    emptySub: { available: 'Yeni teklifler sık sık eklenir. Daha sonra tekrar bakın.', started: 'Bir teklife başlayın, ilerlemenizi buradan takip edin.', done: 'Bitirdiğiniz teklifler burada görünür.' },
    states: { open: '', credited: 'Ödüllendirildi', in_review: 'İnceleniyor', rejected: 'Ödül verilmedi', reversed: 'Geri alındı' },
    isNew: 'Yeni',
    top: 'En yüksek ödül',
    back: 'Geri',
    steps: 'Görevler',
    total: 'Toplam ödül',
    how: 'Nasıl çalışır?',
    howSteps: ['Düğmeye dokunun ve uygulamayı mağazadan yükleyin.', 'Her görevi süresi içinde, aynı cihazla tamamlayın.', 'Her görevden sonra ödülünüz otomatik olarak yüklenir.'],
    missing: 'Bir görevi tamamladınız ama ödül gelmedi mi?',
    claim: 'Eksik ödülü bildir',
    note: 'Ne yaptınız, ne zaman?',
    claimed: 'Teşekkürler, bildiriminizi reklamverene ilettik. Karar genelde 3–7 gün sürer.',
    claimFailed: 'Bildirim oluşturulamadı.',
    footer: 'Teklifler Kiqro Network tarafından sağlanır',
    sale: (m: string, end: string) => `${end} tarihine kadar başladığınız tüm tekliflerde ödüller ×${m}`,
    all: 'Tümü',
    instructions: 'Nasıl tamamlanır?',
    screenshots: 'Ekran görüntüleri',
    categories: { games: 'Oyun', finance: 'Finans', shopping: 'Alışveriş', entertainment: 'Eğlence', lifestyle: 'Yaşam', utilities: 'Uygulama', other: 'Diğer' } as Record<string, string>,
  },
};
type Texts = (typeof T)['en'];

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const locale = (lang: string) => (lang === 'tr' ? 'tr-TR' : 'en-US');
const num = (s: string, lang: string) => new Intl.NumberFormat(locale(lang)).format(Number(s));
/** 5.700 → "5,7B" / "5.7K" on cards; exact amounts stay on the offer page. */
const short = (s: string, lang: string) => {
  const n = Number(s);
  return n < 10_000 ? num(s, lang) : new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
};

const DEFAULT_ACCENT = '#6c57f0';
/** Readable text colour on the accent (WCAG relative luminance). */
function onAccent(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.45 ? '#111018' : '#ffffff';
}

const ICONS = {
  ios: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"/></svg>',
  android:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.6 9.5l1.7-3a.4.4 0 0 0-.7-.4l-1.8 3.1A10.7 10.7 0 0 0 12 8.2c-1.7 0-3.3.4-4.8 1L5.4 6.1a.4.4 0 0 0-.7.4l1.7 3A9.9 9.9 0 0 0 1.5 17h21a9.9 9.9 0 0 0-4.9-7.5zM7 14.2a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>',
  web: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>',
  gift: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="26" width="44" height="30" rx="6" fill="var(--accent)" opacity=".18"/><rect x="6" y="18" width="52" height="12" rx="5" fill="var(--accent)" opacity=".35"/><path d="M32 18v38" stroke="var(--accent)" stroke-width="5"/><path d="M32 18c-4-8-14-10-14-3 0 4 8 3 14 3zm0 0c4-8 14-10 14-3 0 4-8 3-14 3z" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linejoin="round"/></svg>',
};

const CSS = `
:root{--bg:#0b0a12;--surface:#15131f;--surface2:#1d1a2b;--line:rgba(255,255,255,.08);--fg:#f6f5ff;--muted:#a19db8;--subtle:#6f6b86;--good:#34d399;--warn:#fbbf24;--bad:#f87171;--shadow:0 10px 30px -12px rgba(0,0,0,.6);color-scheme:dark}
:root.light{--bg:#f4f4f8;--surface:#ffffff;--surface2:#f1f0f7;--line:rgba(17,16,24,.08);--fg:#16141f;--muted:#5d5a70;--subtle:#8e8aa3;--shadow:0 10px 28px -14px rgba(30,20,80,.28);color-scheme:light}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}svg{width:100%;height:100%;display:block}
.wrap{max-width:560px;margin:0 auto}
header{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:12px;padding:14px 16px 10px}
.logo{width:38px;height:38px;border-radius:11px;object-fit:cover;flex:none;background:var(--surface2)}
.mono{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;flex:none;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#ff5fa2));color:var(--on-accent);font-weight:800;font-size:17px}
.hd{min-width:0;flex:1}.hd h1{margin:0;font-size:18px;font-weight:750;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hd p{margin:1px 0 0;color:var(--muted);font-size:12.5px}
.cur{flex:none;font-size:12px;font-weight:650;padding:6px 10px;border-radius:999px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:color-mix(in srgb,var(--accent) 70%,var(--fg))}
nav{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:0 16px 12px;padding:4px;border-radius:14px;background:var(--surface2)}
nav a{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 4px;border-radius:10px;color:var(--muted);font-size:13px;font-weight:600;transition:background .25s,color .25s}
nav a b{font-size:11px;min-width:18px;padding:1px 6px;border-radius:999px;background:var(--line);color:inherit;text-align:center}
nav a.on{background:var(--surface);color:var(--fg);box-shadow:0 2px 10px -4px rgba(0,0,0,.35)}nav a.on b{background:var(--accent);color:var(--on-accent)}
main{padding:14px 16px 28px;display:grid;gap:14px}
.card{position:relative;display:block;background:var(--surface);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:var(--shadow);transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s;animation:rise .5s cubic-bezier(.22,1,.36,1) both}
.card:active{transform:scale(.985)}
@media (hover:hover){.card:hover{transform:translateY(-3px);box-shadow:0 18px 40px -16px color-mix(in srgb,var(--accent) 45%,transparent)}}
main>.card:nth-child(2){animation-delay:.05s}main>.card:nth-child(3){animation-delay:.1s}main>.card:nth-child(4){animation-delay:.15s}main>.card:nth-child(n+5){animation-delay:.2s}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.cover{position:relative;aspect-ratio:2/1;overflow:hidden;background:var(--surface2)}
.cover>img.full{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s cubic-bezier(.22,1,.36,1)}
@media (hover:hover){.card:hover .cover>img.full{transform:scale(1.04)}}
.cover .blur{position:absolute;inset:-20%;width:140%;height:140%;object-fit:cover;filter:blur(28px) saturate(1.5);opacity:.9;transform:scale(1.1)}
.cover .mid{position:absolute;inset:0;display:grid;place-items:center}.cover .mid img,.cover .mid span{width:34%;max-width:120px;aspect-ratio:1;border-radius:24%;object-fit:cover;box-shadow:0 14px 34px -10px rgba(0,0,0,.6);background:var(--surface)}
.cover .glow{position:absolute;inset:0;background:radial-gradient(120% 90% at 20% 0%,color-mix(in srgb,var(--accent) 55%,transparent),transparent 60%),linear-gradient(135deg,color-mix(in srgb,var(--accent) 40%,#1a1530),#120f1f)}
.cover::after{content:'';position:absolute;inset:auto 0 0;height:40%;background:linear-gradient(transparent,rgba(0,0,0,.35));pointer-events:none}
.tags{position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:1}
.tag{font-size:11px;font-weight:700;padding:5px 9px;border-radius:999px;background:rgba(10,8,20,.62);color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.tag.hot{background:var(--accent);color:var(--on-accent)}
.plat{position:absolute;top:10px;left:10px;width:28px;height:28px;padding:6px;border-radius:9px;background:rgba(10,8,20,.62);color:#fff;z-index:1;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.body{display:flex;align-items:center;gap:12px;padding:12px 14px 14px}
.ic{width:52px;height:52px;border-radius:14px;object-fit:cover;flex:none;background:var(--surface2);border:1px solid var(--line)}
.letter{display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#ff5fa2))!important;color:var(--on-accent);font-weight:800;font-size:22px;border:0}.cover .mid .letter{font-size:clamp(28px,11vw,52px)}
.meta{min-width:0;flex:1}.eyebrow{font-size:11px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:color-mix(in srgb,var(--accent) 75%,var(--fg))}
.name{font-weight:700;font-size:16px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prog{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:11.5px;color:var(--muted)}.prog i{flex:1;height:6px;border-radius:999px;background:var(--surface2);overflow:hidden}.prog i s{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 50%,#ff5fa2))}
.cta{flex:none;display:grid;justify-items:center;min-width:86px;padding:9px 12px;border-radius:14px;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 70%,#ff5fa2));color:var(--on-accent);font-weight:800;font-size:16px;line-height:1.1;box-shadow:0 8px 20px -8px color-mix(in srgb,var(--accent) 80%,transparent)}
.cta small{font-size:10.5px;font-weight:600;opacity:.85;max-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cta.ok{background:color-mix(in srgb,var(--good) 18%,transparent);color:var(--good);box-shadow:none}
.empty{text-align:center;padding:48px 20px;color:var(--muted)}.empty .art{width:96px;height:96px;margin:0 auto 14px}.empty h2{margin:0 0 4px;color:var(--fg);font-size:17px}.empty p{margin:0;font-size:13.5px}
.msg{padding:12px 14px;border-radius:14px;font-size:13.5px;background:var(--surface);border:1px solid var(--line)}.msg.ok{color:var(--good);border-color:color-mix(in srgb,var(--good) 35%,transparent)}.msg.err{color:var(--bad)}
.top{display:flex;align-items:center;gap:10px;padding:12px 16px}
.backbtn{display:grid;place-items:center;width:38px;height:38px;padding:9px;border-radius:12px;background:var(--surface2);flex:none}
.hero{margin:0 16px;border-radius:22px;overflow:hidden;box-shadow:var(--shadow);animation:rise .5s cubic-bezier(.22,1,.36,1) both}
.hero .cover{aspect-ratio:16/9}
.ohead{display:flex;gap:14px;align-items:center;padding:16px 16px 4px}.ohead .ic{width:64px;height:64px;border-radius:18px}
.ohead h1{margin:0;font-size:21px;letter-spacing:-.015em}.sub{display:flex;align-items:center;gap:6px;margin-top:3px;color:var(--muted);font-size:13px}.sub span{width:14px;height:14px}
.desc{margin:8px 16px 0;color:var(--muted);font-size:14px}
.total{display:flex;align-items:center;justify-content:space-between;margin:16px 16px 0;padding:14px 16px;border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 22%,var(--surface)),var(--surface));border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)}
.total span{color:var(--muted);font-size:13px}.total b{font-size:24px;letter-spacing:-.02em}.total b small{font-size:13px;color:var(--muted);font-weight:600;margin-left:4px}
h2.sec{margin:22px 16px 10px;font-size:15px}
ol.steps{list-style:none;margin:0 16px;padding:0;display:grid;gap:0}
ol.steps li{position:relative;display:flex;gap:12px;align-items:flex-start;padding:0 0 16px}
ol.steps li:not(:last-child)::before{content:'';position:absolute;left:15px;top:34px;bottom:2px;width:2px;background:var(--line)}
.dot{position:relative;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;flex:none;font-size:13px;font-weight:800;background:var(--surface2);color:var(--muted);border:2px solid var(--line)}
li.credited .dot{background:var(--good);border-color:var(--good);color:#06291c;padding:7px}li.in_review .dot{border-color:var(--warn);color:var(--warn)}li.rejected .dot,li.reversed .dot{border-color:var(--bad);color:var(--bad)}
.st{flex:1;min-width:0;padding-top:4px}.st b{display:block;font-size:14.5px;font-weight:650}.st small{color:var(--subtle);font-size:12px}
.chip{display:inline-block;margin-left:6px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:999px;vertical-align:1px;background:var(--surface2);color:var(--muted)}
li.credited .chip{background:color-mix(in srgb,var(--good) 18%,transparent);color:var(--good)}li.in_review .chip{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}li.rejected .chip,li.reversed .chip{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}
.pts{flex:none;padding-top:5px;font-weight:800;font-size:14.5px;color:color-mix(in srgb,var(--accent) 70%,var(--fg))}li.credited .pts{color:var(--good)}
.how{margin:6px 16px 0;padding:14px 16px;border-radius:18px;background:var(--surface);border:1px solid var(--line)}.how h3{margin:0 0 8px;font-size:14px}.how ol{margin:0;padding-left:18px;color:var(--muted);font-size:13px;display:grid;gap:4px}
details{margin:14px 16px 0;padding:12px 16px;border-radius:18px;background:var(--surface);border:1px solid var(--line);font-size:13.5px}summary{cursor:pointer;color:var(--muted);font-weight:600}
form{display:grid;gap:8px;margin-top:10px}select,textarea{width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface2);color:var(--fg);font:inherit}
.btn2{padding:11px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 60%,transparent);background:transparent;color:var(--fg);font:inherit;font-weight:650}
.dock{position:sticky;bottom:0;z-index:4;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg) 35%)}
.go{display:flex;align-items:center;justify-content:center;gap:10px;padding:15px;border-radius:16px;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 70%,#ff5fa2));color:var(--on-accent);font-weight:800;font-size:16px;box-shadow:0 14px 30px -12px color-mix(in srgb,var(--accent) 90%,transparent);transition:transform .25s}
.go:active{transform:scale(.98)}.go span{width:18px;height:18px}
footer{color:var(--subtle);font-size:11px;text-align:center;padding:4px 16px 22px}
.sale{display:flex;align-items:center;gap:10px;margin:0 16px 12px;padding:10px 12px;border-radius:14px;font-size:13px;font-weight:650;color:var(--on-accent);background:linear-gradient(110deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#ffb020));box-shadow:0 10px 24px -14px var(--accent)}
.sale b{font-size:18px;line-height:1}
.chips{display:flex;gap:6px;overflow-x:auto;padding:0 16px 12px;scrollbar-width:none}.chips::-webkit-scrollbar{width:0;height:0}
.chips a{flex:none;padding:6px 12px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--muted);background:var(--surface2);border:1px solid var(--line)}
.chips a.on{color:var(--on-accent);background:var(--accent);border-color:var(--accent)}
.cat{display:inline-block;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:var(--surface2);color:var(--muted);margin-left:6px}
.instr{margin:6px 16px 0;padding:14px 16px;border-radius:18px;background:var(--surface);border:1px solid var(--line);font-size:13.5px;color:var(--muted);white-space:pre-line}.instr h3{margin:0 0 6px;font-size:14px;color:var(--fg)}
.shots{display:flex;gap:10px;overflow-x:auto;padding:0 16px 4px;scroll-snap-type:x mandatory;scrollbar-width:none}.shots::-webkit-scrollbar{width:0;height:0}
.shots img{flex:none;height:220px;border-radius:14px;border:1px solid var(--line);scroll-snap-align:start;background:var(--surface2)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

function platformIcon(platform: string): string {
  return platform === 'ios' ? ICONS.ios : platform === 'web' ? ICONS.web : ICONS.android;
}

const initial = (o: Offer) => o.title.trim().charAt(0).toUpperCase() || '★';

/** Banner, or the icon on a blurred copy of itself, or an accent gradient with the initial. */
function cover(o: Offer, tags: string): string {
  const img = (cls: string, src: string) => `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  const inner = o.coverUrl
    ? img('full', o.coverUrl)
    : o.iconUrl
      ? `${img('blur', o.iconUrl)}<div class="mid">${img('', o.iconUrl)}</div>`
      : `<div class="glow"></div><div class="mid"><span class="letter">${esc(initial(o))}</span></div>`;
  return `<div class="cover">${inner}<span class="plat">${platformIcon(o.platform)}</span>${tags ? `<div class="tags">${tags}</div>` : ''}</div>`;
}

const icon = (o: Offer, cls = 'ic') =>
  o.iconUrl ? `<img class="${cls}" src="${esc(o.iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${cls} letter">${esc(initial(o))}</span>`;
const credited = (o: Offer) => o.tasks.filter((s) => s.state === 'credited').length;

function offerCard(o: Offer, t: Texts, lang: string, currency: string, href: string, top: boolean): string {
  const tags = [o.isNew && !o.started ? `<span class="tag">${esc(t.isNew)}</span>` : '', top ? `<span class="tag hot">${esc(t.top)}</span>` : ''].join('');
  const done = credited(o);
  const progress = o.started
    ? `<div class="prog"><i><s style="width:${Math.round((done / o.tasks.length) * 100)}%"></s></i>${esc(t.progress(done, o.tasks.length))}</div>`
    : '';
  const cta = o.completed
    ? `<span class="cta ok"><span style="width:22px;height:22px">${ICONS.check}</span></span>`
    : `<span class="cta">+${esc(short(o.totalRewardPoints, lang))}<small>${esc(currency)}</small></span>`;
  return `<a class="card" href="${esc(href)}">${cover(o, tags)}
    <div class="body">${o.coverUrl ? icon(o) : ''}<div class="meta"><div class="eyebrow">${esc(t.tasks(o.tasks.length))}</div><div class="name">${esc(o.title)}</div>${progress}</div>${cta}</div></a>`;
}

function offerPage(o: Offer, t: Texts, lang: string, currency: string, heading: string, backHref: string, base: string, hidden: string, notice: string): string {
  const steps = o.tasks
    .map(
      (s) => `<li class="${esc(s.state)}"><span class="dot">${s.state === 'credited' ? ICONS.check : esc(s.seq)}</span>
        <div class="st"><b>${esc(s.name)}${t.states[s.state] ? `<span class="chip">${esc(t.states[s.state])}</span>` : ''}</b><small>${esc(t.days(s.timeLimitDays))}</small></div>
        <span class="pts">+${esc(num(s.rewardPoints, lang))}</span></li>`,
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
  const go = o.completed
    ? ''
    : `<div class="dock"><a class="go" href="${esc(o.clickUrl)}" target="_blank" rel="noopener">${esc(o.started ? t.continue : t.start)} · +${esc(num(o.totalRewardPoints, lang))} ${esc(currency)}<span>${ICONS.arrow}</span></a></div>`;
  return `<header><div class="top"><a class="backbtn" href="${esc(backHref)}" aria-label="${esc(t.back)}">${ICONS.back}</a><div class="hd"><h1>${esc(heading)}</h1></div><span class="cur">${esc(currency)}</span></div></header>
    <div class="wrap">${notice ? `<div style="margin:12px 16px 0">${notice}</div>` : ''}
    <div class="hero" style="margin-top:12px">${cover(o, o.isNew && !o.started ? `<span class="tag">${esc(t.isNew)}</span>` : '')}</div>
    <div class="ohead">${icon(o)}<div><h1>${esc(o.title)}</h1><div class="sub"><span>${platformIcon(o.platform)}</span>${esc(o.platform === 'ios' ? 'App Store' : o.platform === 'web' ? 'Web' : 'Google Play')} · ${esc(t.tasks(o.tasks.length))}${o.category !== 'other' ? `<span class="cat">${esc(t.categories[o.category] ?? o.category)}</span>` : ''}</div></div></div>
    ${o.description ? `<p class="desc">${esc(o.description)}</p>` : ''}
    <div class="total"><span>${esc(t.total)}</span><b>+${esc(num(o.totalRewardPoints, lang))}<small>${esc(currency)}</small></b></div>
    <h2 class="sec">${esc(t.steps)}</h2><ol class="steps">${steps}</ol>
    ${o.instructions ? `<div class="instr"><h3>${esc(t.instructions)}</h3>${esc(o.instructions)}</div>` : ''}
    ${o.screenshots.length ? `<h2 class="sec">${esc(t.screenshots)}</h2><div class="shots">${o.screenshots.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div>` : ''}
    <div class="how"><h3>${esc(t.how)}</h3><ol>${t.howSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    ${claim}${go}<footer style="margin-top:14px">${esc(t.footer)}</footer></div>`;
}

function page(lang: string, title: string, light: boolean, brand: PlacementInfo | null, body: string): string {
  const accent = brand?.brandColor && /^#[0-9a-f]{6}$/i.test(brand.brandColor) ? brand.brandColor : DEFAULT_ACCENT;
  return `<!doctype html><html lang="${esc(lang)}"${light ? ' class="light"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="${light ? '#f4f4f8' : '#0b0a12'}"><title>${esc(title)}</title>
<style>${CSS}:root{--accent:${accent};--on-accent:${onAccent(accent)}}</style></head><body>${body}</body></html>`;
}

const CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors *";

export function registerWall(app: FastifyInstance, db: Db, trackingBaseUrl: string, countryOf: (req: FastifyRequest) => string | null): void {
  app.get<{ Querystring: Query }>('/wall', async (req, reply) => {
    const lang = req.query.lang === 'tr' ? 'tr' : 'en';
    const t = T[lang];
    // Dark by default; publishers with a light app pass theme=light.
    const light = req.query.theme === 'light';
    const tab = ['started', 'done'].includes(req.query.tab ?? '') ? (req.query.tab as 'started' | 'done') : 'available';
    // Platform and custom parameters are the publisher's; the category is the user's filter.
    const options = offerQueryOptions(req.query);
    const category = options.categories?.[0];
    const result = await listOffers(db, {
      appKey: req.query.app_key ?? '',
      publisherUserId: req.query.user_id ?? '',
      signature: req.query.sig,
      // Cloudflare's country; the publisher's ?country= as a fallback (as in the Offers API).
      country: countryOf(req) ?? (/^[A-Z]{2}$/.test(req.query.country?.toUpperCase() ?? '') ? req.query.country!.toUpperCase() : null),
      lang,
      trackingBaseUrl,
      publisherRisk: req.query.risk,
      ...options,
    });
    reply.header('content-security-policy', CSP).header('cache-control', 'no-store').header('referrer-policy', 'no-referrer').type('text/html; charset=utf-8');
    if (!result.ok) return reply.code(result.status).send(page(lang, t.title, light, null, `<div class="empty">${esc(result.reason)}</div>`));

    const placement = result.placement;
    const keep = new URLSearchParams({
      app_key: req.query.app_key!,
      user_id: req.query.user_id!,
      sig: req.query.sig!,
      lang,
      ...(light ? { theme: 'light' } : {}),
      ...(req.query.risk ? { risk: req.query.risk } : {}),
      ...(req.query.country ? { country: req.query.country } : {}),
      ...(options.platforms?.length ? { platform: options.platforms.join(',') } : {}),
      ...options.custom,
    });
    const link = (extra: Record<string, string>) => `?${new URLSearchParams({ ...Object.fromEntries(keep), ...extra }).toString()}`;
    const hidden = [...keep].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
    const notice = req.query.claimed === '1' ? `<div class="msg ok">${esc(t.claimed)}</div>` : req.query.claimed === '0' ? `<div class="msg err">${esc(t.claimFailed)}</div>` : '';
    const base = trackingBaseUrl.replace(/\/$/, '');
    const heading = placement.wallTitle || t.title;

    const groups = {
      available: result.offers.filter((o) => !o.started),
      started: result.offers.filter((o) => o.started && !o.completed),
      done: result.offers.filter((o) => o.completed),
    };

    const selected = req.query.offer ? result.offers.find((o) => o.offerId === req.query.offer) : undefined;
    if (selected) {
      const back = link(tab === 'available' ? {} : { tab });
      return reply.send(page(lang, selected.title, light, placement, offerPage(selected, t, lang, placement.currencyName, heading, back, base, hidden, notice)));
    }

    const list = groups[tab];
    // Category chips for the offers tab: categories present in the full list (filter applied via ?category=).
    const present = tab === 'available' && !selected ? [...new Set(result.offers.map((o) => o.category))].filter((c) => c !== 'other') : [];
    const chips =
      present.length > 1 || category
        ? `<div class="chips"><a class="${category ? '' : 'on'}" href="${esc(link({}))}">${esc(t.all)}</a>${(category && !present.includes(category) ? [...present, category] : present)
            .map((c) => `<a class="${c === category ? 'on' : ''}" href="${esc(link({ category: c }))}">${esc(t.categories[c] ?? c)}</a>`)
            .join('')}</div>`
        : '';
    const sale = placement.sale
      ? `<div class="sale"><b>×${esc(String(placement.sale.multiplier).replace('.', lang === 'tr' ? ',' : '.'))}</b><span>${esc(t.sale(String(placement.sale.multiplier).replace('.', lang === 'tr' ? ',' : '.'), new Date(placement.sale.endsAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'))}</span></div>`
      : '';
    // The single most rewarding offer gets a badge (none when several tie for first place).
    const ranked = [...groups.available].sort((a, b) => Number(BigInt(b.totalRewardPoints) - BigInt(a.totalRewardPoints)));
    const best = ranked.length > 2 && BigInt(ranked[0]!.totalRewardPoints) > BigInt(ranked[1]!.totalRewardPoints) ? ranked[0] : null;
    const tabLink = (key: keyof typeof groups, label: string) =>
      `<a class="${tab === key ? 'on' : ''}" href="${esc(link(key === 'available' ? {} : { tab: key }))}">${esc(label)}<b>${groups[key].length}</b></a>`;
    const brandMark = placement.logoUrl
      ? `<img class="logo" src="${esc(placement.logoUrl)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="mono">${esc((placement.publisherName || heading).trim().charAt(0).toUpperCase() || 'K')}</span>`;
    const cards = list.length
      ? list.map((o) => offerCard(o, t, lang, placement.currencyName, link({ offer: o.offerId, ...(tab === 'available' ? {} : { tab }) }), tab === 'available' && o === best)).join('')
      : `<div class="empty"><div class="art">${ICONS.gift}</div><h2>${esc(t.empty[tab])}</h2><p>${esc(t.emptySub[tab])}</p></div>`;
    const body = `<header><div class="wrap"><div class="bar">${brandMark}<div class="hd"><h1>${esc(heading)}</h1>${placement.publisherName ? `<p>${esc(placement.publisherName)}</p>` : ''}</div><span class="cur">${esc(placement.currencyName)}</span></div>
      <nav>${tabLink('available', t.available)}${tabLink('started', t.started)}${tabLink('done', t.done)}</nav>${sale}${chips}</div></header>
      <div class="wrap"><main>${notice}${cards}</main><footer>${esc(t.footer)}</footer></div>`;
    return reply.send(page(lang, heading, light, placement, body));
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
    const back = new URLSearchParams({
      app_key: appKey,
      user_id: userId,
      sig: b.sig ?? '',
      lang: b.lang === 'tr' ? 'tr' : 'en',
      tab: 'started',
      offer: b.offer_id ?? '',
      claimed: ok ? '1' : '0',
      ...(b.theme === 'light' ? { theme: 'light' } : {}),
      ...(b.risk ? { risk: b.risk } : {}),
      ...(b.country ? { country: b.country } : {}),
    });
    return reply.redirect(`/wall?${back.toString()}`, 303);
  });
}
