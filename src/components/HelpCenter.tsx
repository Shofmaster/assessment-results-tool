import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FiBookOpen, FiExternalLink, FiHelpCircle, FiMail } from 'react-icons/fi';

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
  markdown: string;
};

const HELP_DOCS: HelpDoc[] = [
  { id: 'index', title: 'Overview and Route Inventory', markdown: readmeDoc },
  { id: 'auth', title: 'Auth and Public Pages', markdown: authDoc },
  { id: 'nav', title: 'App Navigation and Access', markdown: navDoc },
  { id: 'library', title: 'Library and Document Ingestion', markdown: libraryDoc },
  { id: 'analysis', title: 'Analysis Workflow', markdown: analysisDoc },
  { id: 'audit', title: 'Audit Simulation', markdown: auditDoc },
  { id: 'review', title: 'Paperwork Review', markdown: reviewDoc },
  { id: 'checklists', title: 'Checklists and Recurring Cycles', markdown: checklistsDoc },
  { id: 'logbook', title: 'Logbook and Inspection Schedule', markdown: logbookDoc },
  { id: 'roster', title: 'Roster and Qualifications', markdown: rosterDoc },
  { id: 'issues', title: 'Issues, Command Center, and Analytics', markdown: issuesDoc },
  { id: 'manuals', title: 'Manual Authoring, Management, and Revisions', markdown: manualsDoc },
  { id: 'dct', title: 'DCT Compliance', markdown: dctDoc },
  { id: 'settings', title: 'Settings and Admin', markdown: settingsDoc },
];

export default function HelpCenter() {
  const [selectedId, setSelectedId] = useState<string>('index');
  const selectedDoc = useMemo(() => HELP_DOCS.find((doc) => doc.id === selectedId) ?? HELP_DOCS[0], [selectedId]);

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
              <h1 className="text-2xl sm:text-3xl font-semibold text-white">Product documentation</h1>
              <p className="text-sm text-white/75 max-w-2xl">
                Browse the full help and instructions set generated from the docs in <code>docs/help</code>.
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

        <section className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 h-fit">
            <div className="flex items-center gap-2 text-white/90 mb-3">
              <FiBookOpen className="text-sky-lighter" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Help Topics</h2>
            </div>
            <nav aria-label="Help documents">
              <ul className="space-y-1.5">
                {HELP_DOCS.map((doc) => {
                  const active = doc.id === selectedDoc.id;
                  return (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(doc.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                          active
                            ? 'border-sky/50 bg-sky/20 text-sky-lighter'
                            : 'border-white/10 bg-navy-900/25 text-white/80 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {doc.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
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
            <div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-headings:text-white prose-p:text-white/80 prose-strong:text-white prose-code:text-sky-lighter prose-a:text-sky-lighter prose-a:no-underline hover:prose-a:underline prose-li:text-white/80 prose-th:text-white prose-td:text-white/80">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDoc.markdown}</ReactMarkdown>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
