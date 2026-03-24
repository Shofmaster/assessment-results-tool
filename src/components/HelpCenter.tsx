import { type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  FiBookOpen,
  FiClipboard,
  FiFileText,
  FiGrid,
  FiHelpCircle,
  FiMail,
  FiSettings,
  FiShield,
  FiTool,
} from 'react-icons/fi';

type HelpCategory = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  links: Array<{ label: string; to: string }>;
};

const HELP_CATEGORIES: HelpCategory[] = [
  {
    title: 'Getting Started',
    description: 'Quickly orient new team members and get productive in minutes.',
    icon: FiGrid,
    links: [
      { label: 'Open Guided Audit', to: '/guided-audit' },
      { label: 'Browse Library', to: '/library' },
    ],
  },
  {
    title: 'Audit Workflows',
    description: 'Core workflows for analysis, audits, reporting, and follow-up.',
    icon: FiClipboard,
    links: [
      { label: 'Run Analysis', to: '/analysis' },
      { label: 'Audit Simulation', to: '/audit' },
      { label: 'Report Builder', to: '/report' },
    ],
  },
  {
    title: 'Manuals',
    description: 'Create, manage, and revise controlled manuals efficiently.',
    icon: FiBookOpen,
    links: [
      { label: 'Manual Writer', to: '/manual-writer' },
      { label: 'Manual Management', to: '/manual-management' },
      { label: 'Revisions', to: '/revisions' },
    ],
  },
  {
    title: 'Logbook and Form 337',
    description: 'Track entries and complete required records with confidence.',
    icon: FiFileText,
    links: [
      { label: 'Logbook', to: '/logbook' },
      { label: 'FAA Form 337', to: '/form-337' },
      { label: 'Schedule', to: '/schedule' },
    ],
  },
  {
    title: 'Admin and Security',
    description: 'Configure settings, access controls, and environment options.',
    icon: FiShield,
    links: [
      { label: 'Settings', to: '/settings' },
      { label: 'Admin Panel', to: '/admin' },
    ],
  },
];

const FAQS = [
  {
    question: 'How do I start a new audit with the least setup?',
    answer:
      'Start in Guided Audit, then use Library references during Analysis. This sequence keeps evidence and findings organized from the first step.',
  },
  {
    question: 'Where should I track corrective actions and open issues?',
    answer:
      'Use CARs and Issues for issue tracking, then validate closure through Revisions and supporting report outputs.',
  },
  {
    question: 'How should I approach manual updates?',
    answer:
      'Draft in Manual Writer, review and publish from Manual Management, and use Revisions for traceability and release discipline.',
  },
  {
    question: 'What should I do if a page is not loading correctly?',
    answer:
      'Refresh once, confirm the selected project is correct, and then open support with the page name and a short issue description.',
  },
];

export default function HelpCenter() {
  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-sky-lighter/80">
                <FiHelpCircle />
                Help Center
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white">Find answers fast</h1>
              <p className="text-sm text-white/75 max-w-2xl">
                Browse workflows, quick links, and frequently asked questions for AeroGap.
              </p>
            </div>
            <a
              href="mailto:support@aerogap.com?subject=AeroGap%20Help%20Request"
              className="inline-flex items-center gap-2 rounded-lg border border-sky-light/40 bg-sky/20 px-4 py-2 text-sm font-medium text-sky-lighter hover:bg-sky/30 transition-colors"
            >
              <FiMail />
              Contact Support
            </a>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {HELP_CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <article key={category.title} className="rounded-xl border border-white/10 bg-navy-900/40 p-4">
                <div className="flex items-center gap-2 text-sky-lighter mb-2">
                  <Icon className="text-base" />
                  <h2 className="text-base font-semibold text-white">{category.title}</h2>
                </div>
                <p className="text-sm text-white/70 mb-3">{category.description}</p>
                <ul className="space-y-2">
                  {category.links.map((entry) => (
                    <li key={`${category.title}-${entry.to}`}>
                      <Link to={entry.to} className="text-sm text-sky-lighter hover:text-white transition-colors">
                        {entry.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <FiTool className="text-sky-lighter" />
            <h2 className="text-xl font-semibold text-white">Frequently asked questions</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((item) => (
              <article key={item.question} className="rounded-lg border border-white/10 bg-navy-900/40 p-4">
                <h3 className="text-sm sm:text-base font-semibold text-white">{item.question}</h3>
                <p className="mt-1 text-sm text-white/70">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <FiSettings className="text-sky-lighter" />
            <h2 className="text-xl font-semibold text-white">Need targeted help?</h2>
          </div>
          <p className="text-sm text-white/75 mb-4">
            Use these direct links when you need focused troubleshooting or configuration support.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/analysis" className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/85 hover:bg-white/5">
              Analysis Help
            </Link>
            <Link to="/manual-writer" className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/85 hover:bg-white/5">
              Manual Writer Help
            </Link>
            <Link to="/logbook" className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/85 hover:bg-white/5">
              Logbook Help
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
