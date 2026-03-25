import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogProductEvent } from '../../hooks/useConvexData';

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
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Guided Audits',
        detail: 'Upload your documents, select a standard, and get structured findings with evidence traceability.',
      },
      {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Paperwork Review',
        detail: 'Identify gaps in your documentation with evidence-based corrective action guidance.',
      },
      {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Revision Intelligence',
        detail: 'Spot regulatory drift and highlight what changed between document revisions and why it matters.',
      },
      {
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        title: 'Actionable Checklists',
        detail: 'Export-ready next steps organized by role — DOM, QM, Safety Manager, and more.',
      },
    ],
    [],
  );

  const personas = useMemo(
    () => [
      {
        icon: '🇺🇸',
        title: 'FAA / Part 145',
        detail: 'Findings mapped to 14 CFR, traceability prompts, and Form 337-ready outputs.',
      },
      {
        icon: '🇪🇺',
        title: 'EASA / Part-145',
        detail: 'Evidence-driven gap analysis mapped to your European maintenance paperwork.',
      },
      {
        icon: '✈️',
        title: 'AS9100 Auditor',
        detail: 'Process-focused audits with clause-level citations and CAPA-ready recommendations.',
      },
      {
        icon: '🛡️',
        title: 'DOM / QM / Safety',
        detail: 'SMS maturity checks, safety risk assessments, and practical next actions.',
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
                <span className="text-lg font-display font-bold text-white tracking-tight">
                  AeroGap
                </span>
              </div>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                <a href="#features" className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  Features
                </a>
                <a href="#how-it-works" className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  How It Works
                </a>
                <a href="#sample-output" className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  Sample Output
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
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white/5">
                  Features
                </a>
                <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white/5">
                  How It Works
                </a>
                <a href="#sample-output" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white/5">
                  Sample Output
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
                  Now in public beta
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white leading-[1.1] max-w-4xl mx-auto">
                  The AI quality copilot{' '}
                  <span className="landing-gradient-text">
                    built for aerospace
                  </span>
                </h1>

                <p className="mt-6 text-lg sm:text-xl text-white/70 leading-relaxed max-w-2xl mx-auto">
                  Turn assessments and paperwork into audit-ready findings, traceability prompts, and CAPA-ready recommendations — without needing another full-time quality hire.
                </p>

                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={handleStartFree}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-sky text-navy-900 font-bold text-base hover:brightness-110 active:brightness-95 shadow-xl shadow-sky/25 transition-all hover:-translate-y-0.5"
                  >
                    Start Free
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <a
                    href="#sample-output"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-white font-semibold text-base hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    See Sample Output
                  </a>
                </div>
              </div>

              {/* Trust bar */}
              <div className="mt-16 landing-fade-in-up landing-delay-200">
                <p className="text-xs uppercase tracking-widest text-white/40 font-semibold mb-5">
                  Built for compliance with
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                  {['14 CFR Part 145', 'EASA Part-145', 'AS9100 Rev D', 'IS-BAO', 'SMS / ICAO Annex 19'].map((std) => (
                    <span key={std} className="text-sm text-white/50 font-medium whitespace-nowrap">
                      {std}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Features ── */}
          <section id="features" className="py-16 sm:py-20 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12 landing-fade-in-up">
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">
                  Everything your quality team needs
                </h2>
                <p className="mt-4 text-white/60 text-lg max-w-2xl mx-auto">
                  One workflow, multiple lenses — so the right person can take action faster.
                </p>
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
          <section id="how-it-works" className="py-16 sm:py-20 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-14 landing-fade-in-up">
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">
                  Three steps to audit-ready
                </h2>
                <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto">
                  From document upload to actionable CAPA — in minutes, not weeks.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 sm:gap-8 landing-fade-in-up landing-delay-100">
                {[
                  {
                    n: '01',
                    title: 'Upload & scope',
                    detail: 'Select your standard (FAA, EASA, AS9100, IS-BAO) and import your assessment documents or maintenance paperwork.',
                    accent: 'from-sky/20 to-sky/5',
                  },
                  {
                    n: '02',
                    title: 'Run guided audit',
                    detail: 'Multiple AI quality personas review your documents and produce structured findings, gaps, and evidence citations.',
                    accent: 'from-sky-light/20 to-sky-light/5',
                  },
                  {
                    n: '03',
                    title: 'Review & export',
                    detail: 'Accept, revise, or reject each finding with human-in-the-loop review. Export CAPA-ready outputs for your team.',
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
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">
                  Multiple quality lenses, one platform
                </h2>
                <p className="mt-4 text-white/60 text-lg max-w-2xl mx-auto">
                  Each audit persona brings domain-specific expertise to your review.
                </p>
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
                      AI should augment your judgment, not replace it. Every finding includes the evidence and reasoning so you stay in control.
                    </p>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: 'Evidence snippets', desc: 'Every finding cites the source document passage' },
                      { label: 'Human review', desc: 'Accept, revise, or reject with clear audit trails' },
                      { label: 'Grounded reasoning', desc: 'Requirement citations and regulatory references included' },
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

          {/* ── Sample Output ── */}
          <section id="sample-output" className="py-16 sm:py-20 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-10 landing-fade-in-up">
                <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">
                  See a sample finding
                </h2>
                <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto">
                  A typical audit output with requirement citation, evidence, gap analysis, and corrective direction.
                </p>
              </div>

              <div className="landing-fade-in-up landing-delay-100">
                <div className="rounded-2xl bg-navy-900/80 border border-white/[0.08] overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                    <span className="ml-3 text-xs text-white/40 font-mono">audit-finding.txt</span>
                  </div>
                  <div className="p-5 sm:p-6 space-y-4 text-sm font-mono">
                    <div>
                      <span className="text-sky font-semibold">Finding:</span>
                      <span className="text-white/80 ml-2">Traceability gap in maintenance control</span>
                    </div>
                    <div>
                      <span className="text-accent-gold font-semibold">Requirement:</span>
                      <span className="text-white/80 ml-2">AS9100 Rev D §8.5.2 — Identification and Traceability</span>
                    </div>
                    <div>
                      <span className="text-green-400 font-semibold">Evidence:</span>
                      <span className="text-white/70 ml-2 italic">"Work package tracking procedure exists, but no bidirectional link to verification criteria."</span>
                    </div>
                    <div>
                      <span className="text-red-400 font-semibold">Gap:</span>
                      <span className="text-white/70 ml-2">Procedures reference tracking, but do not show how requirements flow down and how verification is mapped back.</span>
                    </div>
                    <div>
                      <span className="text-sky-light font-semibold">CAPA:</span>
                      <span className="text-white/70 ml-2">Update the control procedure to add explicit bidirectional traceability steps; assign an owner; verify via internal audit before closure.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Final CTA ── */}
          <section className="py-16 sm:py-24 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto text-center landing-fade-in-up">
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">
                Ready to streamline your audits?
              </h2>
              <p className="mt-4 text-white/60 text-lg max-w-xl mx-auto">
                Join aerospace quality professionals using AeroGap to turn compliance from a burden into a competitive advantage.
              </p>
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
                  href="mailto:support@aerogap.com?subject=AeroGap%20Demo%20Request"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/[0.06] border border-white/10 text-white font-semibold text-base hover:bg-white/10 hover:border-white/20 transition-all"
                >
                  Book a Demo
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
                <span className="text-sm font-display font-semibold text-white/80">AeroGap</span>
              </div>
              <div className="flex items-center gap-6 text-xs text-white/40">
                <span>Aviation Quality Company</span>
                <span className="hidden sm:inline">·</span>
                <span>Powered by Claude</span>
                <span className="hidden sm:inline">·</span>
                <a href="mailto:support@aerogap.com" className="hover:text-white/60 transition-colors">
                  Contact
                </a>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
