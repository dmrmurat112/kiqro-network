import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Check,
  Fingerprint,
  Globe2,
  Layers,
  ShieldCheck,
  Sparkles,
  Wallet,
  Workflow,
  Zap,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Reveal } from '@/components/Reveal';
import { DemoForm } from '@/components/site/DemoForm';
import { HeroMockup } from '@/components/site/HeroMockup';
import { SiteNav } from '@/components/site/SiteNav';
import { isLocale, SITE, type Locale } from '@/lib/i18n';

const MMPS = ['AppsFlyer', 'Adjust', 'Singular', 'Kochava', 'Branch', 'Tenjin', 'Airbridge', 'S2S'];
const WHY_ICONS = [Layers, ShieldCheck, Globe2, BarChart3, Wallet, Zap];
const STEP_ICONS = [Workflow, Sparkles, Fingerprint];

function SectionHeader({ eyebrow, title, sub, center = true }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={`max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-violet-400">{eyebrow}</div>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">{title}</h2>
      {sub && <p className="mt-5 text-lg leading-relaxed text-pretty text-muted">{sub}</p>}
    </div>
  );
}

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : 'en';
  const t = SITE[lang];

  return (
    <>
      <SiteNav lang={lang} t={t.nav} />

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-28">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-violet-500/25 blur-[140px]" />
        <div className="absolute top-40 -right-40 h-[380px] w-[380px] rounded-full bg-orange-500/15 blur-[120px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <Reveal immediate>
              <span className="eyebrow">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-good" />
                {t.hero.eyebrow}
              </span>
            </Reveal>
            <Reveal immediate delay={80}>
              <h1 className="mt-7 text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-[4.4rem]">
                {t.hero.title1}
                <br />
                <span className="text-gradient">{t.hero.title2}</span>
              </h1>
            </Reveal>
            <Reveal immediate delay={160}>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">{t.hero.sub}</p>
            </Reveal>
            <Reveal immediate delay={240}>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#demo" className="btn-primary">
                  {t.hero.primary} <ArrowRight size={16} />
                </a>
                <a href="#how" className="btn-ghost">
                  {t.hero.secondary}
                </a>
              </div>
            </Reveal>
            <Reveal immediate delay={320}>
              <dl className="mt-14 grid max-w-xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
                {t.hero.stats.map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="text-2xl font-semibold tracking-tight">{s.value}</dd>
                    <dd className="mt-1 text-xs leading-snug text-subtle">{s.label}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[0.7rem] text-subtle">{t.hero.statsNote}</p>
            </Reveal>
          </div>
          <Reveal immediate delay={200} className="mx-auto w-full max-w-md lg:max-w-none">
            <HeroMockup t={t.mockup} />
          </Reveal>
        </div>
      </section>

      {/* ---------- MMP strip ---------- */}
      <section className="border-y border-line bg-elevated/40 py-10">
        <p className="px-5 text-center text-sm text-subtle">{t.mmps.title}</p>
        <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
          <div className="flex w-max animate-ticker gap-14 pr-14">
            {[...MMPS, ...MMPS].map((name, i) => (
              <span key={i} className="text-xl font-semibold tracking-tight text-fg/40">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-20 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <SectionHeader eyebrow={t.how.eyebrow} title={t.how.title} />
          </Reveal>
          <div className="relative mt-16 grid gap-6 lg:grid-cols-3">
            <div className="absolute top-12 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent lg:block" />
            {t.how.steps.map((step, i) => {
              const Icon = STEP_ICONS[i]!;
              return (
                <Reveal key={step.title} delay={i * 120}>
                  <div className="card-glow relative h-full rounded-2xl !bg-elevated p-7">
                    <div className="flex items-center gap-4">
                      <div className="grid h-12 w-12 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
                        <Icon size={22} />
                      </div>
                      <span className="font-mono text-sm text-subtle">0{i + 1}</span>
                    </div>
                    <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                    <p className="mt-3 leading-relaxed text-muted">{step.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Why (bento) ---------- */}
      <section id="why" className="scroll-mt-20 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <SectionHeader eyebrow={t.why.eyebrow} title={t.why.title} />
          </Reveal>
          <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {t.why.items.map((item, i) => {
              const Icon = WHY_ICONS[i]!;
              const wide = i === 0 || i === 3;
              return (
                <Reveal key={item.title} delay={(i % 3) * 100} className={wide ? 'lg:col-span-2' : ''}>
                  <div className="card-glow group relative h-full overflow-hidden rounded-2xl p-7">
                    {wide && <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl transition-opacity group-hover:opacity-100" />}
                    <Icon size={22} className="text-violet-300" />
                    <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2.5 max-w-lg leading-relaxed text-muted">{item.body}</p>
                    {i === 0 && (
                      <div className="mt-7 flex flex-wrap items-center gap-2 text-xs">
                        {['Install · $0.60', 'Level 10 · $3.00', 'Level 25 · $4.50', 'Purchase · $6.00'].map((step, k) => (
                          <span key={step} className="flex items-center gap-2">
                            <span className="rounded-lg border border-line-strong bg-surface-strong px-2.5 py-1.5 font-mono text-fg/80">{step}</span>
                            {k < 3 && <ArrowRight size={13} className="text-subtle" />}
                          </span>
                        ))}
                      </div>
                    )}
                    {i === 3 && (
                      <div className="mt-7 flex h-16 items-end gap-1.5">
                        {[28, 40, 34, 52, 46, 62, 58, 74, 68, 86, 80, 96].map((h, k) => (
                          <div key={k} className="flex-1 rounded-t bg-gradient-to-t from-violet-500/30 to-violet-400/80" style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Fraud ---------- */}
      <section id="fraud" className="scroll-mt-20 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-elevated to-bg p-8 sm:p-12 lg:p-16">
            <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-500/15 blur-[100px]" />
            <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
              <Reveal>
                <SectionHeader eyebrow={t.fraud.eyebrow} title={t.fraud.title} sub={t.fraud.sub} center={false} />
              </Reveal>
              <Reveal delay={120}>
                <ul className="grid gap-3">
                  {t.fraud.checks.map((check) => (
                    <li key={check} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-good/15 text-good">
                        <Check size={13} strokeWidth={3} />
                      </span>
                      <span className="text-[0.95rem]">{check}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex items-center gap-4 rounded-xl border border-warn/25 bg-warn/5 px-4 py-3.5">
                  <ShieldCheck className="shrink-0 text-warn" size={22} />
                  <p className="text-sm text-muted">
                    <span className="font-semibold text-fg">$0 {t.fraud.stat}.</span> {t.fraud.statLabel}
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" className="scroll-mt-20 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <SectionHeader eyebrow={t.pricing.eyebrow} title={t.pricing.title} sub={t.pricing.sub} />
          </Reveal>
          <div className="mt-16 grid gap-5 lg:grid-cols-3">
            {t.pricing.models.map((m, i) => (
              <Reveal key={m.name} delay={i * 100}>
                <div
                  className={`relative h-full rounded-2xl p-8 ${
                    'featured' in m && m.featured
                      ? 'border border-violet-500/50 bg-gradient-to-b from-violet-500/15 to-surface shadow-[0_30px_80px_-30px_rgb(108_87_240/0.6)]'
                      : 'card-glow'
                  }`}
                >
                  <div className="font-mono text-4xl font-semibold tracking-tight">{m.name}</div>
                  <p className="mt-4 leading-relaxed text-muted">{m.desc}</p>
                  <div className="mt-8 inline-block rounded-full border border-line-strong px-3 py-1 text-xs text-subtle">{m.tag}</div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={150}>
            <ul className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-x-8 gap-y-3">
              {t.pricing.terms.map((term) => (
                <li key={term} className="flex items-center gap-2 text-sm text-muted">
                  <Check size={15} className="text-violet-400" /> {term}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="scroll-mt-20 py-24 lg:py-32">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{t.faq.title}</h2>
          </Reveal>
          <div className="mt-12 divide-y divide-line rounded-2xl border border-line bg-surface">
            {t.faq.items.map((item) => (
              <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-medium">
                  {item.q}
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Demo ---------- */}
      <section id="demo" className="scroll-mt-20 pb-24 lg:pb-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-500/[0.12] via-elevated to-orange-500/[0.06] p-8 sm:p-12 lg:p-16">
            <div className="bg-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_left,black,transparent_70%)]" />
            <div className="relative grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <SectionHeader eyebrow={t.demo.eyebrow} title={t.demo.title} sub={t.demo.sub} center={false} />
              </div>
              <div className="glass rounded-2xl p-6 sm:p-8">
                <DemoForm lang={lang} t={t.demo} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-muted">{t.footer.tagline}</p>
          </div>
          <div className="text-sm">
            <div className="font-semibold">{t.footer.product}</div>
            <ul className="mt-4 space-y-2.5 text-muted">
              <li><a href="#how" className="hover:text-fg">{t.nav.how}</a></li>
              <li><a href="#fraud" className="hover:text-fg">{t.nav.fraud}</a></li>
              <li><a href="#pricing" className="hover:text-fg">{t.nav.pricing}</a></li>
              <li><Link href="/login" className="hover:text-fg">{t.nav.login}</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            <div className="font-semibold">{t.footer.company}</div>
            <ul className="mt-4 space-y-2.5 text-muted">
              <li><a href="https://kiqro.com" className="hover:text-fg">{t.footer.users}</a></li>
              <li><a href="mailto:ads@kiqro.com" className="hover:text-fg">{t.footer.contact}: ads@kiqro.com</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line py-6 text-center text-xs text-subtle">{t.footer.rights}</div>
      </footer>
    </>
  );
}
