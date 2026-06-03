import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FiArrowRight,
  FiBookOpen,
  FiExternalLink,
  FiFileText,
  FiHelpCircle,
  FiImage,
  FiLayers,
  FiMail,
  FiMap,
  FiPlayCircle,
} from 'react-icons/fi';

import readmeDoc from '../../docs/help/README.md?raw';
import authDoc from '../../docs/help/auth-and-public-pages.md?raw';
import navDoc from '../../docs/help/app-navigation-and-access.md?raw';
import libraryDoc from '../../docs/help/library-and-document-ingestion.md?raw';
import analysisDoc from '../../docs/help/analysis-workflow.md?raw';
import auditDoc from '../../docs/help/audit-simulation.md?raw';
import reviewDoc from '../../docs/help/paperwork-review.md?raw';
import checklistsDoc from '../../docs/help/checklists-and-recurring-cycles.md?raw';
import logbookDoc from '../../docs/help/logbook-and-inspection-schedule.md?raw';
import rosterDoc from '../../docs/help/roster-and-qualifications.md?raw';
import issuesDoc from '../../docs/help/issues-command-center-and-analytics.md?raw';
import manualsDoc from '../../docs/help/manual-authoring-management-and-revisions.md?raw';
import dctDoc from '../../docs/help/dct-compliance.md?raw';
import settingsDoc from '../../docs/help/settings-and-admin.md?raw';

type HelpDoc = {
  id: string;
  title: string;
  category: 'onboarding' | 'operations' | 'governance';
  summary: string;
  route?: string;
  markdown: string;
};

const HELP_DOCS: HelpDoc[] = [
  {
    id: 'index',
    title: 'Overview and Route Inventory',
    category: 'onboarding',
    summary: 'Start here for route map, access rules, and maintenance guidance.',
    markdown: readmeDoc,
  },
  {
    id: 'auth',
    title: 'Auth and Public Pages',
    category: 'onboarding',
    summary: 'How sign-in, landing, and public SEO pages are routed.',
    markdown: authDoc,
  },
  {
    id: 'nav',
    title: 'App Navigation and Access',
    category: 'onboarding',
    summary: 'Route shell, role gates, and redirect behavior.',
    markdown: navDoc,
  },
  {
    id: 'library',
    title: 'Library and Document Ingestion',
    category: 'operations',
    summary: 'Upload, parse, and maintain project evidence corpus.',
    route: '/library',
    markdown: libraryDoc,
  },
  {
    id: 'analysis',
    title: 'Analysis Workflow',
    category: 'operations',
    summary: 'Run analysis and export results.',
    route: '/analysis',
    markdown: analysisDoc,
  },
  {
    id: 'audit',
    title: 'Audit Simulation',
    category: 'operations',
    summary: 'Run, pause, save, and escalate simulation findings.',
    route: '/audit',
    markdown: auditDoc,
  },
  {
    id: 'review',
    title: 'Paperwork Review',
    category: 'operations',
    summary: 'Review documents, produce findings, and generate reports.',
    route: '/review',
    markdown: reviewDoc,
  },
  {
    id: 'checklists',
    title: 'Checklists and Recurring Cycles',
    category: 'operations',
    summary: 'Execute checklist runs and schedule recurring cycles.',
    route: '/checklists',
    markdown: checklistsDoc,
  },
  {
    id: 'logbook',
    title: 'Logbook and Inspection Schedule',
    category: 'operations',
    summary: 'Logbook intake, compliance checks, and schedule sync.',
    route: '/logbook',
    markdown: logbookDoc,
  },
  {
    id: 'roster',
    title: 'Roster and Qualifications',
    category: 'operations',
    summary: 'Manage personnel requirements and due-date status.',
    route: '/roster',
    markdown: rosterDoc,
  },
  {
    id: 'issues',
    title: 'Issues, Command Center, and Analytics',
    category: 'governance',
    summary: 'Track issues and monitor quality trends.',
    route: '/quality-command-center',
    markdown: issuesDoc,
  },
  {
    id: 'manuals',
    title: 'Manual Authoring, Management, and Revisions',
    category: 'governance',
    summary: 'Generate and manage manual revisions with traceability.',
    route: '/manual-management',
    markdown: manualsDoc,
  },
  {
    id: 'dct',
    title: 'DCT Compliance',
    category: 'governance',
    summary: 'DCT ingest, traceability, and scheduled compliance checks.',
    route: '/dct-compliance',
    markdown: dctDoc,
  },
  {
    id: 'settings',
    title: 'Settings and Admin',
    category: 'governance',
    summary: 'Model preferences, user controls, and admin governance.',
    route: '/settings',
    markdown: settingsDoc,
  },
];

const HELP_GROUPS: Array<{ id: HelpDoc['category']; title: string }> = [
  { id: 'onboarding', title: 'Onboarding' },
  { id: 'operations', title: 'Core Operations' },
  { id: 'governance', title: 'Governance and Controls' },
];

const QUICK_TASKS = [
  { label: 'Run paper review', to: '/review', icon: FiFileText },
  { label: 'Start audit simulation', to: '/audit', icon: FiPlayCircle },
  { label: 'Open logbook', to: '/logbook', icon: FiLayers },
  { label: 'DCT compliance', to: '/dct-compliance', icon: FiMap },
];

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function extractHeadings(markdown: string): Array<{ id: string; text: string }> {
  return markdown
    .split('\n')
    .map((line) => line.match(/^##\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ text: m[1], id: slugifyHeading(m[1]) }));
}

function flattenText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(flattenText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return flattenText((children as { props?: { children?: ReactNode } }).props?.children ?? '');
  }
  return '';
}

export default function HelpCenter() {
  const [selectedId, setSelectedId] = useState<string>('index');
  const selectedDoc = useMemo(() => HELP_DOCS.find((doc) => doc.id === selectedId) ?? HELP_DOCS[0], [selectedId]);
  const headings = useMemo(() => extractHeadings(selectedDoc.markdown), [selectedDoc.markdown]);
  const groupedDocs = useMemo(
    () =>
      HELP_GROUPS.map((group) => ({
        ...group,
        docs: HELP_DOCS.filter((doc) => doc.category === group.id),
      })),
    [],
  );

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-sky-lighter/80">
                <FiHelpCircle />
                Help Center
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white">Polished product guidance</h1>
              <p className="text-sm text-white/75 max-w-2xl">
                Workflows, screenshots, and function-level guidance rendered from <code>docs/help</code>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="mailto:support@aerogap.com?subject=AeroGap%20Help%20Request"
                className="inline-flex items-center gap-2 rounded-lg border border-sky-light/40 bg-sky/20 px-4 py-2 text-sm font-medium text-sky-lighter hover:bg-sky/30 transition-colors"
              >
                <FiMail />
                Contact Support
              </a>
              {selectedDoc.route ? (
                <Link
                  to={selectedDoc.route}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
                >
                  Open page
                  <FiArrowRight />
                </Link>
              ) : null}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {QUICK_TASKS.map((task) => {
              const Icon = task.icon;
              return (
                <Link
                  key={task.to}
                  to={task.to}
                  className="group rounded-xl border border-white/10 bg-navy-900/35 px-3.5 py-3 text-sm text-white/85 hover:text-white hover:border-sky/40 hover:bg-sky/10 transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="text-sky-lighter" />
                    {task.label}
                  </span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-white/55 group-hover:text-white/75">
                    Jump now <FiArrowRight />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_220px] gap-4">
          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 h-fit xl:sticky xl:top-4">
            <div className="flex items-center gap-2 text-white/90 mb-3.5">
              <FiBookOpen className="text-sky-lighter" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Help Topics</h2>
            </div>
            <nav aria-label="Help documents">
              <div className="space-y-3.5">
                {groupedDocs.map((group) => (
                  <div key={group.id}>
                    <h3 className="px-2 text-[10px] tracking-wide uppercase text-white/45 mb-1.5">{group.title}</h3>
                    <ul className="space-y-1.5">
                      {group.docs.map((doc) => {
                        const active = doc.id === selectedDoc.id;
                        return (
                          <li key={doc.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedId(doc.id)}
                              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                                active
                                  ? 'border-sky/50 bg-sky/20 text-sky-lighter'
                                  : 'border-white/10 bg-navy-900/25 text-white/80 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <span className="block text-sm font-medium leading-tight">{doc.title}</span>
                              <span className="block text-xs text-white/50 mt-1">{doc.summary}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </nav>
          </aside>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 lg:p-8">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-xl font-semibold text-white">{selectedDoc.title}</h2>
              <span className="inline-flex items-center gap-1 text-xs text-white/60">
                Synced from markdown
                <FiExternalLink />
              </span>
            </div>
            <div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-headings:text-white prose-p:text-white/80 prose-strong:text-white prose-code:text-sky-lighter prose-a:text-sky-lighter prose-a:no-underline hover:prose-a:underline prose-li:text-white/80 prose-th:text-white prose-td:text-white/80 prose-hr:border-white/10">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => {
                    const text = flattenText(children);
                    return (
                      <h2 id={slugifyHeading(text)} className="scroll-mt-24">
                        {children}
                      </h2>
                    );
                  },
                  blockquote: ({ children }) => {
                    const text = flattenText(children);
                    const normalized = text.toLowerCase();
                    const type = normalized.startsWith('tip:')
                      ? 'tip'
                      : normalized.startsWith('warning:')
                        ? 'warning'
                        : normalized.startsWith('best practice:')
                          ? 'best'
                          : 'note';
                    const styleMap = {
                      tip: 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100',
                      warning: 'border-amber-400/45 bg-amber-500/10 text-amber-100',
                      best: 'border-sky/45 bg-sky/15 text-sky-100',
                      note: 'border-white/20 bg-white/5 text-white/85',
                    } as const;
                    return <blockquote className={`rounded-xl border px-4 py-3 not-italic ${styleMap[type]}`}>{children}</blockquote>;
                  },
                  img: ({ src = '', alt = '' }) => (
                    <figure className="my-6 rounded-xl border border-white/10 bg-navy-950/40 p-2">
                      <img src={src} alt={alt} className="w-full rounded-lg border border-white/10" loading="lazy" />
                      {alt ? <figcaption className="mt-2 px-1 text-xs text-white/55">{alt}</figcaption> : null}
                    </figure>
                  ),
                  ul: ({ children }) => <ul className="space-y-1.5">{children}</ul>,
                }}
              >
                {selectedDoc.markdown}
              </ReactMarkdown>
            </div>
          </article>

          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 h-fit xl:sticky xl:top-4">
            <div className="flex items-center gap-2 text-white/90 mb-3">
              <FiImage className="text-sky-lighter" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">On this page</h2>
            </div>
            {headings.length ? (
              <ul className="space-y-1.5">
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      className="block rounded-md border border-white/10 bg-navy-900/25 px-2.5 py-1.5 text-xs text-white/75 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/50">No section anchors in this doc yet.</p>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}
