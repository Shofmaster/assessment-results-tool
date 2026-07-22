import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogProductEvent } from '../../hooks/useConvexData';
import {
  PRODUCT_INTENT_COMPANY_NAME,
  PRODUCT_INTENT_COMPANY_OUTCOMES,
  PRODUCT_INTENT_COMPANY_SITE_URL,
  PRODUCT_INTENT_FEATURES_INTRO,
  PRODUCT_INTENT_FEATURES_SECTION_HEADLINE,
  PRODUCT_INTENT_FINAL_CTA_HEADLINE,
  PRODUCT_INTENT_FINAL_CTA_LINE,
  PRODUCT_INTENT_HERO_HEADLINE,
  PRODUCT_INTENT_HUMAN_LOOP_LINE,
  PRODUCT_INTENT_VALUE_LINE,
} from '../../config/productIntent';
import SeoMeta from '../seo/SeoMeta';
import LandingProductPreview from './LandingProductPreview';

const PRODUCT_SURFACES = [
  {
    title: 'Audit readiness & command center',
    detail:
      'One view of readiness, open issues, inspections, and audit prep—so quality and leadership share the same picture.',
  },
  {
    title: 'Manuals & programs',
    detail:
      'Keep FAA-accepted and EASA-style manuals current with revision discipline and less last-minute scramble.',
  },
  {
    title: 'Library & regulatory grounding',
    detail:
      'Regulations, standards, and company evidence in one library so reviews cite the right authority.',
  },
  {
    title: 'Guided audits & checklists',
    detail:
      'Run structured checks and paperwork review when you want help—you accept, edit, or discard every output.',
  },
] as const;

const SEGMENTS = [
  {
    title: 'FAA Part 145 repair stations',
    detail: 'Repair station manuals, Form 337 workflows, qualifications, and maintenance evidence in one place.',
  },
  {
    title: 'Charter & scheduled operators (121 / 135)',
    detail: 'GOM, training, MEL, and program packages aligned with 14 CFR and your accepted manuals.',
  },
  {
    title: 'EASA Part-145 organizations',
    detail: 'Gap analysis and paperwork discipline for EASA maintenance organizations.',
  },
  {
    title: 'AS9100 & SMS programs',
    detail: 'QMS clause work plus SMS-oriented checks with practical follow-through.',
  },
] as const;

const STEPS = [
  {
    n: '01',
    title: 'Bring the program in',
    detail: 'Upload manuals, training, MEL/MOE, and the records that prove you operate the system.',
  },
  {
    n: '02',
    title: 'Find and close gaps',
    detail: 'Map what you wrote to what the rule asks for, surface mismatches early, and fix them with citations your team signs.',
  },
  {
    n: '03',
    title: 'Walk the audit with evidence',
    detail: 'Track readiness, run guided checks, and export outputs inspectors can follow—human approval required.',
  },
] as const;

const RESOURCE_LINKS = [
  { href: '/aviation-quality', label: 'Aviation quality guide' },
  { href: '/aviation-compliance-audit-services', label: 'Aviation compliance audit services' },
  { href: '/aviation-quality-software', label: 'Aviation quality software' },
  { href: '/faa-repair-station-audit-checklist', label: 'FAA repair station checklist' },
  { href: '/as9100-internal-audit-software', label: 'AS9100 internal audit software' },
  { href: '/aviation-audit-readiness', label: 'Aviation audit readiness' },
  { href: '/aviation-compliance-kpis', label: 'Aviation compliance KPIs' },
] as const;

function AeroGapMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="rounded-sm bg-sky flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={Math.round(size * 0.5)}
        height={Math.round(size * 0.5)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-navy-900"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    </div>
  );
}

const AUTH_PATH = '/sign-in';

export default function LandingPage() {
  const navigate = useNavigate();
  const logProductEvent = useLogProductEvent();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleStartFree = () => {
    const anonymousId = getAnonymousId();
    void logProductEvent({
      eventType: 'landing_cta_click',
      anonymousId,
      properties: JSON.stringify({ cta: 'start_free' }),
    }).catch(() => {});
    navigate(AUTH_PATH);
  };

  const handleLogin = () => {
    navigate(AUTH_PATH);
  };

  useEffect(() => {
    if (!mobileMenuOpen) {
      document.body.style.overflow = '';
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const focusFirstLink = () => {
      const first = mobileNavRef.current?.querySelector<HTMLElement>('a, button');
      first?.focus();
    };
    const focusTimer = window.setTimeout(focusFirstLink, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMobileMenu();
        return;
      }
      if (e.key !== 'Tab' || !mobileNavRef.current) return;
      const focusables = Array.from(
        mobileNavRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <div className="landing-page min-h-dvh bg-[#071018] text-[#e8eef4] overflow-auto font-landing">
      <SeoMeta
        title="Aviation Quality Software & Audit Platform | AeroGap"
        description="AeroGap helps repair stations, operators, and quality teams run manuals, evidence, findings, and audit prep in one human-led workspace."
        canonicalUrl="https://www.aerogaptechnologies.com/"
        jsonLd={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              name: PRODUCT_INTENT_COMPANY_NAME,
              url: 'https://www.aerogaptechnologies.com',
              brand: 'AeroGap',
            },
            {
              '@type': 'WebSite',
              name: 'AeroGap',
              url: 'https://www.aerogaptechnologies.com',
            },
            {
              '@type': 'SoftwareApplication',
              name: 'AeroGap',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            },
          ],
        }}
      />
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Hangar-grid atmosphere (not floating orbs) */}
      <div className="landing-grid-bg fixed inset-0 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#071018]/92 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-14 sm:h-16">
              <div className="flex items-center gap-3 min-w-0">
                <AeroGapMark size={32} />
                <div className="flex flex-col min-w-0 leading-none">
                  <span className="font-landing-display text-xl tracking-wide text-white">AeroGap</span>
                  <span className="text-[10px] font-semibold text-white/45 tracking-[0.12em] uppercase mt-0.5 truncate">
                    {PRODUCT_INTENT_COMPANY_NAME}
                  </span>
                </div>
              </div>

              <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
                {[
                  { href: '#how-we-help', label: 'How we help' },
                  { href: '#product', label: 'Product' },
                  { href: '#how-it-works', label: 'How it works' },
                  { href: '#who', label: 'Who it\'s for' },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="px-3 py-2 text-sm text-white/65 hover:text-white transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              <div className="hidden md:flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLogin}
                  className="px-3 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={handleStartFree}
                  className="px-4 py-2 text-sm font-semibold bg-sky text-navy-900 hover:brightness-110 active:brightness-95 transition-all"
                >
                  Get started free
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-white/70 hover:text-white transition-colors"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav"
              >
                {mobileMenuOpen ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>

            {mobileMenuOpen && (
              <nav
                ref={mobileNavRef}
                id="mobile-nav"
                aria-label="Primary"
                className="md:hidden pb-4 border-t border-white/10 pt-3 space-y-1 landing-fade-in"
              >
                {[
                  { href: '#how-we-help', label: 'How we help' },
                  { href: '#product', label: 'Product' },
                  { href: '#how-it-works', label: 'How it works' },
                  { href: '#who', label: "Who it's for" },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className="block px-3 py-2.5 text-sm text-white/80 hover:bg-white/5"
                  >
                    {item.label}
                  </a>
                ))}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleLogin}
                    className="w-full px-4 py-2.5 text-sm font-medium text-white border border-white/20 hover:bg-white/5 transition-colors"
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={handleStartFree}
                    className="w-full px-4 py-2.5 text-sm font-semibold bg-sky text-navy-900 hover:brightness-110 transition-all"
                  >
                    Get started free
                  </button>
                </div>
              </nav>
            )}
          </div>
        </header>

        <main id="main-content">
          {/* ── Hero: brand + one line + CTA + product visual ── */}
          <section className="relative border-b border-white/10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-14 sm:pb-20">
              <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-10 lg:gap-12 items-center">
                <div className="landing-fade-in-up min-w-0">
                  <p className="font-landing-display text-5xl sm:text-6xl lg:text-7xl tracking-wide text-white leading-[0.95]">
                    AeroGap
                  </p>
                  <h1 className="mt-5 text-2xl sm:text-3xl lg:text-[2.15rem] font-semibold text-white/95 leading-snug max-w-xl">
                    {PRODUCT_INTENT_HERO_HEADLINE}
                  </h1>
                  <p className="mt-4 text-base sm:text-lg text-white/60 leading-relaxed max-w-lg">
                    {PRODUCT_INTENT_VALUE_LINE}
                  </p>
                  <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={handleStartFree}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-sky text-navy-900 font-bold text-base hover:brightness-110 active:brightness-95 transition-all"
                    >
                      Get started free
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <a
                      href="mailto:support@aerogap.com?subject=AeroGap%20demo%20request"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-white/25 text-white font-semibold text-base hover:bg-white/5 transition-colors"
                    >
                      Talk to us
                    </a>
                  </div>
                </div>

                <div className="landing-fade-in-up landing-delay-200 lg:justify-self-end w-full">
                  <LandingProductPreview />
                </div>
              </div>
            </div>
          </section>

          {/* ── How we help companies (light band) ── */}
          <section id="how-we-help" className="scroll-mt-20 bg-[#f3f1ec] text-[#132033]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
              <div className="max-w-2xl landing-fade-in-up">
                <h2 className="font-landing-display text-3xl sm:text-4xl tracking-wide text-[#0a1628]">
                  How AeroGap helps your company
                </h2>
                <p className="mt-3 text-base sm:text-lg text-[#132033]/70 leading-relaxed">
                  Compliance drag shows up as late manuals, missing evidence, and audit week panic. AeroGap turns that into a weekly operating rhythm.
                </p>
              </div>

              <ol className="mt-12 space-y-0 border-t border-[#132033]/15">
                {PRODUCT_INTENT_COMPANY_OUTCOMES.map((item, index) => (
                  <li
                    key={item.title}
                    className="grid sm:grid-cols-[4.5rem_1fr] gap-4 sm:gap-8 py-8 border-b border-[#132033]/15 landing-fade-in-up"
                    style={{ animationDelay: `${100 + index * 80}ms` }}
                  >
                    <span className="font-landing-display text-3xl text-[#0a1628]/25 tabular-nums leading-none pt-0.5">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold text-[#0a1628]">{item.title}</h3>
                      <p className="mt-2 text-[#132033]/70 leading-relaxed max-w-2xl">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ── Product surfaces ── */}
          <section id="product" className="scroll-mt-20 border-b border-white/10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
              <div className="max-w-2xl landing-fade-in-up">
                <h2 className="font-landing-display text-3xl sm:text-4xl tracking-wide text-white">
                  {PRODUCT_INTENT_FEATURES_SECTION_HEADLINE}
                </h2>
                <p className="mt-3 text-white/55 text-base sm:text-lg leading-relaxed">
                  {PRODUCT_INTENT_FEATURES_INTRO}
                </p>
              </div>

              <div className="mt-12 grid sm:grid-cols-2 gap-x-10 gap-y-10 landing-fade-in-up landing-delay-100">
                {PRODUCT_SURFACES.map((surface) => (
                  <div key={surface.title} className="border-l-2 border-sky/60 pl-5">
                    <h3 className="text-lg font-semibold text-white">{surface.title}</h3>
                    <p className="mt-2 text-sm sm:text-base text-white/55 leading-relaxed">{surface.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── How it works ── */}
          <section id="how-it-works" className="scroll-mt-20 border-b border-white/10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
              <div className="max-w-2xl landing-fade-in-up">
                <h2 className="font-landing-display text-3xl sm:text-4xl tracking-wide text-white">
                  From messy to audit-ready
                </h2>
                <p className="mt-3 text-white/55 text-base sm:text-lg leading-relaxed">
                  Three steps your quality and maintenance teams already know—supported by one workspace.
                </p>
              </div>

              <div className="mt-12 grid md:grid-cols-3 gap-8 md:gap-6 landing-fade-in-up landing-delay-100">
                {STEPS.map((step) => (
                  <div key={step.n}>
                    <span className="font-landing-display text-4xl text-sky/40 tabular-nums">{step.n}</span>
                    <h3 className="mt-3 text-xl font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm text-white/55 leading-relaxed">{step.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Who it's for ── */}
          <section id="who" className="scroll-mt-20 bg-[#0c1828] border-b border-white/10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
              <div className="max-w-2xl landing-fade-in-up">
                <h2 className="font-landing-display text-3xl sm:text-4xl tracking-wide text-white">
                  Built for aviation organizations under real oversight
                </h2>
                <p className="mt-3 text-white/55 text-base sm:text-lg leading-relaxed">
                  Same platform whether you are a Part 145 shop, a 135 charter, or running AS9100 / SMS alongside the certificate.
                </p>
              </div>

              <div className="mt-12 grid sm:grid-cols-2 gap-x-12 gap-y-8 landing-fade-in-up landing-delay-100">
                {SEGMENTS.map((segment) => (
                  <div key={segment.title}>
                    <h3 className="text-base font-semibold text-white">{segment.title}</h3>
                    <p className="mt-1.5 text-sm text-white/55 leading-relaxed">{segment.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Human control ── */}
          <section className="border-b border-white/10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
              <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start landing-fade-in-up">
                <div>
                  <h2 className="font-landing-display text-3xl sm:text-4xl tracking-wide text-white">
                    Assistive help. Human accountability.
                  </h2>
                  <p className="mt-4 text-white/60 leading-relaxed max-w-md">
                    {PRODUCT_INTENT_HUMAN_LOOP_LINE}
                  </p>
                </div>
                <ul className="space-y-5">
                  {[
                    {
                      label: 'Evidence-backed findings',
                      desc: 'Reviews cite source passages and requirements—not vibes.',
                    },
                    {
                      label: 'Accept, edit, or reject',
                      desc: 'Nothing becomes official until your team says so.',
                    },
                    {
                      label: 'Time back for the operation',
                      desc: 'Less hunting for paperwork means more capacity for customers and aircraft.',
                    },
                  ].map((item) => (
                    <li key={item.label} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 bg-accent-gold" aria-hidden="true" />
                      <div>
                        <div className="font-semibold text-white text-sm sm:text-base">{item.label}</div>
                        <div className="mt-0.5 text-sm text-white/50">{item.desc}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* ── Final CTA ── */}
          <section className="border-b border-white/10">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center landing-fade-in-up">
              <h2 className="font-landing-display text-3xl sm:text-5xl tracking-wide text-white">
                {PRODUCT_INTENT_FINAL_CTA_HEADLINE}
              </h2>
              <p className="mt-4 text-white/55 text-base sm:text-lg leading-relaxed">
                {PRODUCT_INTENT_FINAL_CTA_LINE}
              </p>
              <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleStartFree}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-sky text-navy-900 font-bold text-base hover:brightness-110 active:brightness-95 transition-all"
                >
                  Get started free
                </button>
                <a
                  href="mailto:support@aerogap.com?subject=AeroGap%20demo%20request"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-white/25 text-white font-semibold text-base hover:bg-white/5 transition-colors"
                >
                  Talk to us
                </a>
              </div>
            </div>
          </section>

          {/* ── Resources ── */}
          <section className="border-b border-white/10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
              <h2 className="font-landing-display text-2xl sm:text-3xl tracking-wide text-white">
                Compliance resources
              </h2>
              <p className="mt-2 text-white/50 text-sm sm:text-base max-w-xl">
                Practical guides for FAA, AS9100, and aviation quality workflows.
              </p>
              <ul className="mt-6 columns-1 sm:columns-2 lg:columns-3 gap-x-10">
                {RESOURCE_LINKS.map((item) => (
                  <li key={item.href} className="mb-2 break-inside-avoid">
                    <a
                      href={item.href}
                      className="text-sm text-sky-light/90 hover:text-sky-lighter underline-offset-2 hover:underline"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <footer className="py-8 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <AeroGapMark size={28} />
                <div className="flex flex-col leading-none">
                  <span className="font-landing-display text-base tracking-wide text-white/85">AeroGap</span>
                  <span className="text-[10px] font-semibold text-white/40 tracking-[0.12em] uppercase mt-0.5">
                    {PRODUCT_INTENT_COMPANY_NAME}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-5 gap-y-2 text-xs text-white/40">
                <a
                  href={PRODUCT_INTENT_COMPANY_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/70 transition-colors"
                >
                  {PRODUCT_INTENT_COMPANY_SITE_URL.replace(/^https:\/\//, '')}
                </a>
                <a href="mailto:support@aerogap.com" className="hover:text-white/70 transition-colors">
                  support@aerogap.com
                </a>
                <Link to="/privacy" className="hover:text-white/70 transition-colors">
                  Privacy
                </Link>
                <Link to="/terms" className="hover:text-white/70 transition-colors">
                  Terms
                </Link>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
