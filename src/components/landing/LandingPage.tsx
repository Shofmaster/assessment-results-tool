import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogProductEvent } from '../../hooks/useConvexData';

function classNames(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(' ');
}

export default function LandingPage() {
  const navigate = useNavigate();
  const logProductEvent = useLogProductEvent();

  const getAnonymousId = (): string => {
    const key = 'aerogap_anonymous_id';
    try {
      const existing = window.localStorage.getItem(key);
      if (existing) return existing;
      const created = crypto.randomUUID();
      window.localStorage.setItem(key, created);
      return created;
    } catch {
      // Fallback: in-memory anonymous id for environments where localStorage is unavailable.
      return 'anonymous';
    }
  };

  const personaProof = useMemo(
    () => [
      { title: 'FAA / Part 145', detail: 'Findings, traceability prompts, and Form 337-ready outputs.' },
      { title: 'EASA / Part-145', detail: 'Evidence-driven gaps mapped to your maintenance paperwork.' },
      { title: 'AS9100 Auditor', detail: 'Process-focused audits with CAPA-ready recommendations.' },
      { title: 'DOM / QM / Safety', detail: 'SMS maturity checks and practical next actions.' },
    ],
    [],
  );

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-900 to-navy-700 p-4 sm:p-6 overflow-auto">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky to-sky-light shadow-lg shadow-sky/20 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <div className="text-sm text-white/70 font-inter">AeroGap</div>
              <div className="text-base font-semibold text-white font-display">Quality Copilot</div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <a
              href="#sample-output"
              className="px-3 py-2 rounded-lg border border-white/15 text-white/80 hover:text-white hover:bg-white/5 transition-colors text-sm font-inter"
            >
              Sample output
            </a>
            <a
              href="mailto:support@aerogap.com?subject=AeroGap%20Book%20Demo"
              className="px-3 py-2 rounded-lg border border-white/15 text-white/80 hover:text-white hover:bg-white/5 transition-colors text-sm font-inter"
            >
              Book demo
            </a>
          </div>
        </header>

        <main id="main-content">
          <section className="pt-8 pb-10">
            <div className="grid lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-inter">
                  Evidence-first audits • Multiple quality personas • Powered by Claude
                </div>

                <h1 className="mt-4 text-4xl md:text-5xl font-display font-bold text-white leading-tight">
                  The AI quality teammate for aerospace.
                </h1>

                <p className="mt-4 text-white/75 text-base md:text-lg font-inter leading-relaxed">
                  Turn your assessment + paperwork into audit-ready findings, traceability prompts, and CAPA-ready
                  recommendations for FAA, EASA, AS9100, and IS-BAO—without needing another full-time quality hire.
                </p>

                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const anonymousId = getAnonymousId();
                      void logProductEvent({
                        eventType: 'landing_cta_click',
                        anonymousId,
                        properties: JSON.stringify({ cta: 'start_free' }),
                      }).catch(() => {});
                      navigate('/logbook');
                    }}
                    className={classNames(
                      'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl',
                      'bg-sky text-navy-900 font-semibold',
                      'hover:brightness-105 active:brightness-95',
                      'shadow-lg shadow-sky/20',
                      'transition-[filter,transform]',
                      'hover:-translate-y-[1px]',
                    )}
                  >
                    Start Free
                    <span aria-hidden="true">→</span>
                  </button>

                  <a
                    href="#sample-output"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/15 text-white/90 font-semibold hover:bg-white/8 transition-colors"
                  >
                    See Sample Audit Output
                  </a>
                </div>

                <div className="mt-4 sm:hidden">
                  <a
                    href="mailto:support@aerogap.com?subject=AeroGap%20Book%20Demo"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/15 text-white/90 font-semibold hover:bg-white/8 transition-colors"
                  >
                    Book demo
                  </a>
                </div>

                <div className="mt-6 grid sm:grid-cols-2 gap-3">
                  {[
                    { title: 'Guided audits', detail: 'Upload docs → run simulations → get structured findings.' },
                    { title: 'Paperwork review', detail: 'Request gaps with evidence and corrective action guidance.' },
                    { title: 'Revision intelligence', detail: 'Spot drift and highlight what changed and why it matters.' },
                    { title: 'Actionable checklists', detail: 'Export-ready next steps for DOM, QM, and Safety.' },
                  ].map((item) => (
                    <div key={item.title} className="glass rounded-2xl p-4 border-white/10">
                      <div className="text-white font-semibold">{item.title}</div>
                      <div className="text-white/70 text-sm font-inter mt-1 leading-relaxed">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="glass rounded-3xl p-5 border-white/10">
                  <div className="text-white/85 font-semibold">How it works</div>
                  <div className="mt-4 space-y-3">
                    {[
                      { n: '1', t: 'Upload & select scope', d: 'Pick your standard and import your assessment/paperwork.' },
                      { n: '2', t: 'Run guided audit', d: 'Multi-persona review produces structured findings and gaps.' },
                      { n: '3', t: 'Turn results into CAPA', d: 'Review, revise, and export outputs ready for action.' },
                    ].map((s) => (
                      <div key={s.n} className="flex gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white font-semibold">
                          {s.n}
                        </div>
                        <div>
                          <div className="text-white font-semibold">{s.t}</div>
                          <div className="text-white/70 text-sm font-inter mt-0.5 leading-relaxed">{s.d}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 pt-5 border-t border-white/10">
                    <div className="text-white/85 font-semibold">Trust & transparency</div>
                    <ul className="mt-3 space-y-2 text-sm text-white/70 font-inter">
                      <li>Evidence snippets alongside each suggested finding</li>
                      <li>Human review prompts with clear acceptance states</li>
                      <li>Grounded reasoning with requirement/citation cues</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="pb-12">
            <div className="flex items-end justify-between gap-6">
              <div>
                <h2 className="text-2xl font-display font-bold text-white">Built for the aerospace quality team</h2>
                <p className="mt-2 text-white/70 font-inter">
                  One workflow, multiple lenses—so the right quality person can take action faster.
                </p>
              </div>
              <div className="hidden md:block text-right text-xs text-white/50 font-inter">
                Powered by Claude
              </div>
            </div>

            <div className="mt-7 grid md:grid-cols-4 gap-4">
              {personaProof.map((p) => (
                <div key={p.title} className="glass rounded-2xl p-4 border-white/10">
                  <div className="text-white font-semibold">{p.title}</div>
                  <div className="text-white/70 text-sm font-inter mt-1 leading-relaxed">{p.detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="sample-output" className="pb-16">
            <div className="flex items-baseline justify-between gap-6">
              <div>
                <h2 className="text-2xl font-display font-bold text-white">See a sample output</h2>
                <p className="mt-2 text-white/70 font-inter">
                  A typical audit finding is presented with requirement, evidence cue, gap, and corrective direction.
                </p>
              </div>
              <div className="text-xs text-white/50 font-inter hidden sm:block">
                Example (structure)
              </div>
            </div>

            <div className="mt-6 glass rounded-3xl p-5 border-white/10">
              <pre className="text-sm text-white/85 font-inter whitespace-pre-wrap">
{`Finding: Traceability gap in maintenance control
Requirement/Citation: AS9100 / relevant clause traceability language
Evidence (from provided docs): “Work package tracking procedure exists, but no bidirectional link to verification criteria.”
Gap: Procedures reference tracking, but do not show how requirements flow down and how verification is mapped back.
Recommended corrective action: Update the control procedure to add explicit bidirectional traceability steps; assign an owner; verify via an internal audit before closure.`}
              </pre>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/logbook')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky text-navy-900 font-semibold hover:brightness-105 active:brightness-95 transition-colors shadow-lg shadow-sky/20"
                >
                  Start Free
                </button>
                <a
                  href="mailto:support@aerogap.com?subject=AeroGap%20Help%20Request"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/15 text-white/90 font-semibold hover:bg-white/8 transition-colors"
                >
                  Ask a question
                </a>
              </div>
            </div>
          </section>

          <footer className="pb-10 pt-8 text-center text-xs text-white/50 font-inter">
            AeroGap • Powered by Claude • Built for aerospace quality
          </footer>
        </main>
      </div>
    </div>
  );
}

