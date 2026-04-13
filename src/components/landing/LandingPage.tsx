import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogProductEvent } from '../../hooks/useConvexData';
import {
  PRODUCT_INTENT_BRAND_SUBTITLE,
  PRODUCT_INTENT_BUSINESS_VALUE_LINE,
  PRODUCT_INTENT_COMPANY_NAME,
  PRODUCT_INTENT_COMPANY_SITE_URL,
  PRODUCT_INTENT_FEATURES_INTRO,
  PRODUCT_INTENT_FEATURES_SECTION_HEADLINE,
  PRODUCT_INTENT_FINAL_CTA_HEADLINE,
  PRODUCT_INTENT_FINAL_CTA_LINE,
  PRODUCT_INTENT_FAA_MANUALS_LINE,
  PRODUCT_INTENT_HERO_BADGE,
  PRODUCT_INTENT_HERO_HEADLINE,
  PRODUCT_INTENT_HUMAN_LOOP_LINE,
  PRODUCT_INTENT_PILLARS,
  PRODUCT_INTENT_TRUST_TIME_BULLET,
  PRODUCT_INTENT_VALUE_LINE,
} from '../../config/productIntent';

export default function LandingPage() {
  const navigate = useNavigate();
  const logProductEvent = useLogProductEvent();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getAnonymousId = (): string => {
    const key = 'aerogap_anonymous_id';
    try {
      const existing = window.localStorage.getItem(key);
      if (existing) return existing;
      const created = crypto.randomUUID();
      window.localStorage.setItem(key, created);
      return created;
    } catch {
      return 'anonymous';
    }
  };

  const handleStartFree = () => {
    const anonymousId = getAnonymousId();
    void logProductEvent({
      eventType: 'landing_cta_click',
      anonymousId,
      properties: JSON.stringify({ cta: 'start_free' }),
    }).catch(() => {});
    navigate('/logbook');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  const features = useMemo(
    () => [
      {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path
              d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
        title: 'Audit readiness & command center',
        detail: 'One place to see readiness, open issues, inspections, and audit prep—so nothing surprises you in the closing meeting.',
      },
      {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
        title: 'Manuals & programs',
        detail: 'Keep FAA-accepted and EASA-style manuals current with revision discipline, traceability, and less last-minute scramble.',
      },
      {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.984 8.984 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.984 8.984 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Library & regulatory grounding',
        detail: 'Regulations, standards, and company evidence in one library so every review cites the right authority.',
      },
      {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Assistive review & checklists',
        detail: 'Guided audits, paperwork review, and checklists when you want help—you decide what ships.',
      },
    ],
    [],
  );

  const personas = useMemo(
    () => [
      {
        icon: '✈️',
        title: 'Charter & scheduled operators (121 / 135)',
        detail: 'GOM, training, MEL, and program packages that stay aligned with 14 CFR and your accepted manuals.',
      },
      {
        icon: '🇺🇸',
        title: 'FAA Part 145',
        detail: 'Repair station manuals, Form 337 workflows, and maintenance evidence in one place.',
      },
      {
        icon: '🇪🇺',
        title: 'EASA Part-145',
        detail: 'Gap analysis and paperwork discipline for EASA maintenance organizations.',
      },
      {
        icon: '🛡️',
        title: 'AS9100 & safety programs',
        detail: 'QMS clause work plus SMS-oriented checks and practical follow-through.',
      },
    ],
    [],
  );

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 overflow-auto">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Decorative background elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-sky/[0.04] blur-3xl" />
        <div className="absolute top-1/2 -left-60 w-[500px] h-[500px] rounded-full bg-sky/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-accent-gold/[0.02] blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* ── Header ── */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-navy-900/70 border-b border-white/[0.06]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky to-sky-light shadow-lg shadow-sky/25 flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div className="flex flex-col min-w-0 leading-tight">
                  <span className="text-lg font-display font-bold text-white tracking-tight">AeroGap</span>
                  <span className="text-[10px] font-semibold text-white/45 tracking-wide uppercase">{PRODUCT_INTENT_COMPANY_NAME}</span>
                </div>
              </div>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                <a href="#pillars" className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  Why AeroGap
                </a>
                <a href="#features" className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  Product
                </a>
                <a href="#how-it-works" className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  How it works
                </a>
                <a
                  href={PRODUCT_INTENT_COMPANY_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Company
                </a>
              </nav>

              {/* Desktop auth buttons */}
              <div className="hidden md:flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleLogin}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white/90 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={handleStartFree}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-sky text-navy-900 hover:brightness-110 active:brightness-95 transition-all shadow-md shadow-sky/20"
                >
                  Get Started Free
                </button>
              </div>

              {/* Mobile menu toggle */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>

            {/* Mobile menu */}
            {mobileMenuOpen && (
              <div className="md:hidden pb-4 border-t border-white/[0.06] mt-1 pt-3 space-y-1 landing-fade-in">
                <a href="#pillars" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white/5">
                  Why AeroGap
                </a>
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white/5">
                  Product
                </a>
                <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white/5">
                  How it works
                </a>
                <a
                  href={PRODUCT_INTENT_COMPANY_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white/5"
                >
                  Company site
                </a>
                <div className="pt-2 flex flex-col gap-2">
                  <button type="button" onClick={handleLogin} className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white border border-white/15 hover:bg-white/5 transition-colors">
                    Log in
                  </button>
                  <button type="button" onClick={handleStartFree} className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-sky text-navy-900 hover:brightness-110 transition-all">
                    Get Started Free
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main id="main-content">
          {/* ── Hero ── */}
          <section className="pt-16 sm:pt-24 pb-16 sm:pb-20 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto text-center">
              <div className="landing-fade-in-up">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky/10 border border-sky/20 text-sky-light text-xs font-semibold tracking-wide uppercase mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky animate-pulse" />
                  {PRODUCT_INTENT_HERO_BADGE}
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white leading-[1.12] max-w-4xl mx-auto">
                  {PRODUCT_INTENT_HERO_HEADLINE}
                </h1>

                <p className="mt-5 text-lg sm:text-xl text-white/70 leading-relaxed max-w-2xl mx-auto">{PRODUCT_INTENT_VALUE_LINE}</p>
                <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl mx-auto">{PRODUCT_INTENT_FAA_MANUALS_LINE}</p>
                <p className="mt-4 text-base text-white/65 leading-relaxed max-w-2xl mx-auto">{PRODUCT_INTENT_BUSINESS_VALUE_LINE}</p>
                <p className="mt-5 inline-flex flex-col sm:flex-row sm:items-center sm:justify-center gap-1 sm:gap-2 text-sm text-white/80 font-medium max-w-2xl mx-auto">
                  <span className="landing-gradient-text font-semibold">{PRODUCT_INTENT_BRAND_SUBTITLE}</span>
                  <span className="text-white/45 hidden sm:inline">·</span>
                  <span className="text-white/60 font-normal">{PRODUCT_INTENT_HUMAN_LOOP_LINE}</span>
                </p>

                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={handleStartFree}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-sky text-navy-900 font-bold text-base hover:brightness-110 active:brightness-95 shadow-xl shadow-sky/25 transition-all hover:-translate-y-0.5"
                  >
                    Start free
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <a
                    href={PRODUCT_INTENT_COMPANY_SITE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-white/15 bg-white/[0.04] text-white font-semibold text-base hover:bg-white/[0.08] transition-all"
                  >
                    About {PRODUCT_INTENT_COMPANY_NAME}
                  </a>
                </div>
              </div>

              {/* Three pillars */}
              <div id="pillars" className="mt-20 sm:mt-24 landing-fade-in-up landing-delay-200 scroll-mt-24">
                <p className="text-xs uppercase tracking-widest text-white/40 font-semibold mb-8 text-center">What we stand for</p>
                <div className="grid md:grid-cols-3 gap-4 sm:gap-5 text-left max-w-5xl mx-auto">
                  {PRODUCT_INTENT_PILLARS.map((pillar) => (
                    <div
                      key={pillar.title}
                      className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-6 sm:p-7 hover:border-white/[0.14] transition-colors"
                    >
                      <h2 className="text-lg font-semibold text-white mb-2">{pillar.title}</h2>
                      <p className="text-sm text-white/60 leading-relaxed">{pillar.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Features ── */}
          <section id="features" className="py-16 sm:py-20 px-4 sm:px-6 scroll-mt-24">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12 landing-fade-in-up">
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">
                  {PRODUCT_INTENT_FEATURES_SECTION_HEADLINE}
                </h2>
                <p className="mt-4 text-white/60 text-lg max-w-2xl mx-auto">{PRODUCT_INTENT_FEATURES_INTRO}</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 sm:gap-5 landing-fade-in-up landing-delay-100">
                {features.map((f) => (
                  <div
                    key={f.title}
                    className="group relative rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300"
                  >
                    <div className="w-11 h-11 rounded-xl bg-sky/10 border border-sky/20 flex items-center justify-center text-sky mb-4 group-hover:bg-sky/15 group-hover:border-sky/30 transition-colors">
                      {f.icon}
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                    <p className="text-white/60 text-sm leading-relaxed">{f.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── How It Works ── */}
          <section id="how-it-works" className="py-16 sm:py-20 px-4 sm:px-6 scroll-mt-24">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-14 landing-fade-in-up">
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">From messy to audit-ready</h2>
                <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto">
                  Organize evidence and manuals, align them to the rules, then walk audits with traceability.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 sm:gap-8 landing-fade-in-up landing-delay-100">
                {[
                  {
                    n: '01',
                    title: 'Gather & scope',
                    detail: 'Pull in regulations, manuals, training, MEL, MOE, and the records that prove you operate the program.',
                    accent: 'from-sky/20 to-sky/5',
                  },
                  {
                    n: '02',
                    title: 'Align & close gaps',
                    detail: 'Map what you wrote to what the rule asks for, surface mismatches early, and fix them with citations your team signs.',
                    accent: 'from-sky-light/20 to-sky-light/5',
                  },
                  {
                    n: '03',
                    title: 'Prove it in the audit',
                    detail: 'Track readiness, run guided checks, export defensible outputs—assistive help optional, human approval required.',
                    accent: 'from-accent-gold/20 to-accent-gold/5',
                  },
                ].map((step) => (
                  <div key={step.n} className="relative">
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${step.accent} opacity-0 group-hover:opacity-100 transition-opacity`} />
                    <div className="relative rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 sm:p-7 hover:border-white/[0.12] transition-all h-full">
                      <span className="text-3xl font-display font-bold text-white/10">{step.n}</span>
                      <h3 className="mt-3 text-xl font-semibold text-white">{step.title}</h3>
                      <p className="mt-3 text-white/60 text-sm leading-relaxed">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Personas ── */}
          <section className="py-16 sm:py-20 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12 landing-fade-in-up">
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">Same platform, your segment</h2>
                <p className="mt-4 text-white/60 text-lg max-w-2xl mx-auto">Repair, charter, airline, MRO, or aerospace quality—manual-first compliance in one workspace.</p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 landing-fade-in-up landing-delay-100">
                {personas.map((p) => (
                  <div
                    key={p.title}
                    className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300"
                  >
                    <span className="text-2xl" role="img" aria-hidden="true">{p.icon}</span>
                    <h3 className="mt-3 text-base font-semibold text-white">{p.title}</h3>
                    <p className="mt-2 text-white/60 text-sm leading-relaxed">{p.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Trust & Transparency ── */}
          <section className="py-16 sm:py-20 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-8 sm:p-10 landing-fade-in-up">
                <div className="grid sm:grid-cols-2 gap-8 sm:gap-12">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">
                      Trust & transparency
                    </h2>
                    <p className="mt-4 text-white/60 leading-relaxed">
                      {PRODUCT_INTENT_HUMAN_LOOP_LINE} Findings include evidence and reasoning.
                    </p>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: 'Evidence snippets', desc: 'Findings cite source passages' },
                      { label: 'Human review', desc: 'Accept, revise, or reject' },
                      { label: 'Grounded reasoning', desc: 'Requirement and regulatory citations' },
                      {
                        label: PRODUCT_INTENT_TRUST_TIME_BULLET.label,
                        desc: PRODUCT_INTENT_TRUST_TIME_BULLET.desc,
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex gap-3">
                        <div className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-sky/15 border border-sky/30 flex items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-sky">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-white font-medium text-sm">{item.label}</div>
                          <div className="text-white/50 text-sm">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Final CTA ── */}
          <section className="py-16 sm:py-24 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto text-center landing-fade-in-up">
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">{PRODUCT_INTENT_FINAL_CTA_HEADLINE}</h2>
              <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto">{PRODUCT_INTENT_FINAL_CTA_LINE}</p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleStartFree}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-sky text-navy-900 font-bold text-base hover:brightness-110 active:brightness-95 shadow-xl shadow-sky/25 transition-all hover:-translate-y-0.5"
                >
                  Get Started Free
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <a
                  href="mailto:support@aerogap.com?subject=AeroGap%20Technologies%20%E2%80%94%20Demo%20request"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/[0.06] border border-white/10 text-white font-semibold text-base hover:bg-white/10 hover:border-white/20 transition-all"
                >
                  Talk to us
                </a>
              </div>
            </div>
          </section>

          {/* ── Footer ── */}
          <footer className="border-t border-white/[0.06] py-8 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky to-sky-light flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-display font-semibold text-white/80">AeroGap</span>
                  <span className="text-[10px] font-semibold text-white/45 tracking-wide uppercase">{PRODUCT_INTENT_COMPANY_NAME}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-6 gap-y-2 text-xs text-white/40">
                <a
                  href={PRODUCT_INTENT_COMPANY_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/60 transition-colors"
                >
                  {PRODUCT_INTENT_COMPANY_SITE_URL.replace(/^https:\/\//, '')}
                </a>
                <span className="hidden sm:inline">·</span>
                <a href="mailto:support@aerogap.com" className="hover:text-white/60 transition-colors">
                  support@aerogap.com
                </a>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
