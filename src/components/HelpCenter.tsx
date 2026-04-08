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
  FiUsers,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiLoader,
  FiMinusCircle,
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
    description: 'Select or create a project in the sidebar first — all data is project-scoped. Then open Guided Audit to walk through the key setup steps.',
    icon: FiGrid,
    links: [
      { label: 'Guided Audit', to: '/guided-audit' },
      { label: 'Library', to: '/library' },
    ],
  },
  {
    title: 'Compliance & Auditing',
    description: 'Run paperwork reviews, audit simulations, and generate CARs. Use the Quality Command Center for a real-time dashboard of open findings.',
    icon: FiClipboard,
    links: [
      { label: 'Paperwork Review', to: '/review' },
      { label: 'Audit Simulation', to: '/audit' },
      { label: 'CARs & Issues', to: '/entity-issues' },
      { label: 'Quality Command Center', to: '/quality-command-center' },
    ],
  },
  {
    title: 'Manuals & Revisions',
    description: 'Draft new manuals in Manual Writer, manage approved versions in Manual Management, and check document currency in Revisions.',
    icon: FiBookOpen,
    links: [
      { label: 'Manual Writer', to: '/manual-writer' },
      { label: 'Manual Management', to: '/manual-management' },
      { label: 'Revision Tracker', to: '/revisions' },
    ],
  },
  {
    title: 'Logbook & Form 337',
    description: 'Import or enter aircraft logbook entries, review compliance against Part 43 or EASA, and complete FAA Form 337 major repairs/alterations.',
    icon: FiFileText,
    links: [
      { label: 'Logbook', to: '/logbook' },
      { label: 'FAA Form 337', to: '/form-337' },
      { label: 'Inspection Schedule', to: '/logbook?tab=schedule' },
    ],
  },
  {
    title: 'Personnel & Roster',
    description: 'Add personnel, define qualification requirement types, and assign requirements to individuals. Track who is current, due, or expired.',
    icon: FiUsers,
    links: [
      { label: 'Roster', to: '/roster' },
      { label: 'Checklists', to: '/checklists' },
    ],
  },
  {
    title: 'Settings & Admin',
    description: 'Configure AI model preferences, thinking budgets, and Google Drive sync. Admins can manage company features and user roles.',
    icon: FiShield,
    links: [
      { label: 'Settings', to: '/settings' },
      { label: 'Admin Panel', to: '/admin' },
    ],
  },
];

const FAQS = [
  {
    question: 'Nothing loads — where do I start?',
    answer:
      'Select a project in the left sidebar. Nearly all data (documents, analyses, checklists, logbook entries) is scoped to the active project. If no project exists yet, create one from the project switcher.',
  },
  {
    question: 'How do I run a paperwork review?',
    answer:
      'Go to Paperwork Review. Step 1: add the document(s) you want reviewed. Step 2: add reference documents (your manuals, regs). Step 3: pick auditor perspectives (FAA Inspector, EASA, etc.). Then click Start Review. The AI compares the submitted document against the references and generates findings.',
  },
  {
    question: 'How do I track open corrective actions?',
    answer:
      'CARs and Issues (in the left nav under Compliance) holds all open findings. You can promote findings from Paperwork Review or Audit Simulation directly to CARs. The Quality Command Center shows aggregate CAR status across your project.',
  },
  {
    question: 'How do I update a manual?',
    answer:
      'Go to Manual Management, find the manual, and use the revision workflow to create a new draft. Or use Manual Writer to draft content with AI assistance, then publish from Manual Management. The Revision Tracker shows whether your documents are on the latest known revision.',
  },
  {
    question: 'What does a status dot color mean?',
    answer:
      'Green = current/up to date. Amber/yellow = due within 30 days or approaching expiry. Red = expired/overdue. Blue = currently checking. Grey = unknown or not yet checked. These appear in Roster, Revision Tracker, and the Compliance Dashboard.',
  },
];

const STATUS_INDICATORS = [
  {
    icon: FiCheckCircle,
    color: 'text-emerald-400',
    dotColor: 'bg-emerald-400',
    label: 'Current / Up to date',
    desc: 'The item is within its valid period. No action needed.',
  },
  {
    icon: FiClock,
    color: 'text-amber-400',
    dotColor: 'bg-amber-400',
    label: 'Due soon (within 30 days)',
    desc: 'Approaching expiry or renewal date. Plan ahead.',
  },
  {
    icon: FiAlertCircle,
    color: 'text-red-400',
    dotColor: 'bg-red-400',
    label: 'Expired / Overdue',
    desc: 'Past due date. Requires immediate attention.',
  },
  {
    icon: FiLoader,
    color: 'text-sky-400',
    dotColor: 'bg-sky-400',
    label: 'Checking',
    desc: 'AeroGap is currently verifying currency via web search.',
  },
  {
    icon: FiMinusCircle,
    color: 'text-white/40',
    dotColor: 'bg-white/30',
    label: 'Unknown / Not checked',
    desc: 'No revision data yet. Run a check to update.',
  },
];

const ACCESS_ROLES = [
  { role: 'AeroGap Admin / Staff', access: 'All companies, all data, admin surfaces, feature policy management' },
  { role: 'Company Admin (company_admin)', access: 'All users, projects, and settings within their own company' },
  { role: 'Company Member', access: 'Projects and documents assigned to their company' },
];

export default function HelpCenter() {
  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-sky-lighter/80">
                <FiHelpCircle />
                Help Center
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white">Find answers fast</h1>
              <p className="text-sm text-white/75 max-w-2xl">
                Workflows, quick links, status indicators, and FAQs for AeroGap.
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

        {/* Feature areas */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {HELP_CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <article key={category.title} className="rounded-xl border border-white/10 bg-navy-900/40 p-4">
                <div className="flex items-center gap-2 text-sky-lighter mb-2">
                  <Icon className="text-base shrink-0" />
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

        {/* Status indicator guide */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <FiCheckCircle className="text-sky-lighter" />
            <h2 className="text-xl font-semibold text-white">Status indicators</h2>
          </div>
          <p className="text-sm text-white/70 mb-5">
            These colored dots and icons appear on the Roster, Revision Tracker, and Compliance Dashboard to show the health of personnel qualifications, document revisions, and checklist items.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {STATUS_INDICATORS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-start gap-3 rounded-xl border border-white/10 bg-navy-900/30 p-3">
                  <div className={`mt-0.5 shrink-0 ${s.color}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${s.dotColor}`} />
                      <span className="text-sm font-medium text-white">{s.label}</span>
                    </div>
                    <p className="text-xs text-white/55">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Role access table */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <FiShield className="text-sky-lighter" />
            <h2 className="text-xl font-semibold text-white">Who can access what</h2>
          </div>
          <p className="text-sm text-white/70 mb-4">
            All data lives inside a <strong className="text-white/90">project</strong>. Users only see projects for their organization. AeroGap staff should select a company from the sidebar to scope their view to that tenant.
          </p>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left px-4 py-2.5 font-semibold text-white/80">Role</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-white/80">Access</th>
                </tr>
              </thead>
              <tbody>
                {ACCESS_ROLES.map((row, i) => (
                  <tr key={row.role} className={i < ACCESS_ROLES.length - 1 ? 'border-b border-white/10' : ''}>
                    <td className="px-4 py-3 text-sky-lighter font-medium whitespace-nowrap">{row.role}</td>
                    <td className="px-4 py-3 text-white/70">{row.access}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
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

        {/* Quick links */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <FiSettings className="text-sky-lighter" />
            <h2 className="text-xl font-semibold text-white">Quick links</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Paperwork Review', to: '/review' },
              { label: 'Audit Simulation', to: '/audit' },
              { label: 'CARs & Issues', to: '/entity-issues' },
              { label: 'Manual Writer', to: '/manual-writer' },
              { label: 'Logbook', to: '/logbook' },
              { label: 'Roster', to: '/roster' },
              { label: 'Revisions', to: '/revisions' },
              { label: 'Settings', to: '/settings' },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/85 hover:bg-white/5 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
