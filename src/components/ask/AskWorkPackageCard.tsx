import type { ReactNode } from 'react';
import { FiAlertTriangle, FiBookOpen, FiClipboard, FiTool } from 'react-icons/fi';
import type { AskSource } from '../../types/askSources';
import type { AskWorkPackage } from '../../types/askWorkPackage';
import { categoryLabel } from './AskMarkdown';

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
        {icon}
        {title}
      </h3>
      <div className="text-sm text-white/90">{children}</div>
    </section>
  );
}

export default function AskWorkPackageCard({
  package: pkg,
  sources,
  onOpenSource,
}: {
  package: AskWorkPackage;
  sources?: AskSource[];
  onOpenSource: (source: AskSource) => void;
}) {
  const byTag = new Map((sources || []).map((s) => [s.tag, s]));
  const melHasItem = Boolean(
    pkg.mel.item ||
      pkg.mel.deferralCategory ||
      pkg.mel.maintenanceProcedures ||
      pkg.mel.operationalProcedures ||
      pkg.mel.operationalLimits,
  );
  const citedFromSteps = new Set(pkg.troubleshootingSteps.flatMap((s) => s.refTags));
  const refSources = (sources || []).filter((s) => citedFromSteps.has(s.tag));
  const log = pkg.exampleLogEntries;

  return (
    <div className="mt-2 space-y-4 rounded-xl border border-sky/25 bg-sky/5 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200/80">Full answer</p>

      {pkg.noManualReferencesFound ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-100">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>
            No specific manual references found. Treat guidance as general practice and verify against
            the aircraft&apos;s published data.
          </span>
        </div>
      ) : null}

      {pkg.summary ? (
        <Section title="Summary" icon={<FiBookOpen className="text-sky-light" />}>
          <p className="whitespace-pre-line leading-6">{pkg.summary}</p>
        </Section>
      ) : null}

      <Section title="MEL" icon={<FiTool className="text-sky-light" />}>
        {!melHasItem ? (
          <p className="text-white/65 italic">
            {pkg.mel.gapNote || 'Not in retrieved MEL/MMEL passages.'}
          </p>
        ) : (
          <dl className="space-y-2">
            {pkg.mel.item ? (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/45">Item</dt>
                <dd>{pkg.mel.item}</dd>
              </div>
            ) : null}
            {pkg.mel.deferralCategory ? (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/45">Deferral category</dt>
                <dd>{pkg.mel.deferralCategory}</dd>
              </div>
            ) : null}
            {pkg.mel.maintenanceProcedures ? (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/45">(M) procedures</dt>
                <dd className="whitespace-pre-line">{pkg.mel.maintenanceProcedures}</dd>
              </div>
            ) : null}
            {pkg.mel.operationalProcedures ? (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/45">(O) procedures</dt>
                <dd className="whitespace-pre-line">{pkg.mel.operationalProcedures}</dd>
              </div>
            ) : null}
            {pkg.mel.operationalLimits ? (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/45">Operational limits</dt>
                <dd className="whitespace-pre-line">{pkg.mel.operationalLimits}</dd>
              </div>
            ) : null}
            {pkg.mel.gapNote ? (
              <p className="text-xs text-white/50 italic">{pkg.mel.gapNote}</p>
            ) : null}
          </dl>
        )}
      </Section>

      {pkg.troubleshootingSteps.length > 0 ? (
        <Section title="Troubleshooting">
          <ol className="list-decimal space-y-2 pl-5">
            {pkg.troubleshootingSteps.map((step, i) => (
              <li key={i} className="leading-6">
                <span>{step.text}</span>
                {step.refTags.length > 0 ? (
                  <span className="ml-1 inline-flex flex-wrap gap-0.5 align-middle">
                    {step.refTags.map((tag) => {
                      const source = byTag.get(tag);
                      if (!source) {
                        return (
                          <span
                            key={tag}
                            className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-white/10 px-1 text-[10px] font-bold text-white/40"
                          >
                            {tag.slice(1)}
                          </span>
                        );
                      }
                      const name = source.kind === 'record' ? source.label : source.docName;
                      return (
                        <sup key={tag} className="ml-0.5">
                          <button
                            type="button"
                            onClick={() => onOpenSource(source)}
                            aria-label={`Source ${tag.slice(1)}: ${name}`}
                            title={name}
                            className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-sky/25 px-1 text-[10px] font-bold text-sky-200 transition-colors hover:bg-sky/45 hover:text-white"
                          >
                            {tag.slice(1)}
                          </button>
                        </sup>
                      );
                    })}
                  </span>
                ) : (
                  <span className="ml-1.5 inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/45">
                    no source
                  </span>
                )}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {pkg.correctiveAction ? (
        <Section title="Corrective action">
          <p className="whitespace-pre-line leading-6">{pkg.correctiveAction}</p>
        </Section>
      ) : null}

      {pkg.partsNeeded.length > 0 ? (
        <Section title="Parts needed">
          <ul className="space-y-1">
            {pkg.partsNeeded.map((p, i) => (
              <li key={i}>
                <span className="font-mono text-sky-light">{p.partNumber || '—'}</span>
                {p.description ? ` — ${p.description}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {refSources.length > 0 ? (
        <Section title="References" icon={<FiBookOpen className="text-sky-light" />}>
          <ul className="space-y-1">
            {refSources.map((source) => (
              <li key={source.tag}>
                <button
                  type="button"
                  onClick={() => onOpenSource(source)}
                  className="group flex w-full items-baseline gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/5"
                >
                  <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-sky/25 px-1 text-[10px] font-bold text-sky-200">
                    {source.tag.slice(1)}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[11px] font-medium text-sky-200 group-hover:underline">
                      {source.kind === 'record' ? source.label : source.docName}
                    </span>
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-white/35">
                      {source.kind === 'record' ? 'record' : categoryLabel(source.category)}
                    </span>
                    {source.kind === 'chunk' && source.excerpt ? (
                      <span className="block truncate text-[11px] text-white/50">{source.excerpt}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {log.discrepancyWriteUp || log.workPerformed || log.returnToServiceStatement ? (
        <Section title="Example log entries" icon={<FiClipboard className="text-sky-light" />}>
          <p className="mb-2 text-[11px] text-white/45">
            Draft language only — verify against the aircraft&apos;s data and your procedures before use.
          </p>
          <div className="space-y-2">
            {log.discrepancyWriteUp ? (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-white/45">Discrepancy</div>
                <p className="whitespace-pre-line">{log.discrepancyWriteUp}</p>
              </div>
            ) : null}
            {log.workPerformed ? (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-white/45">
                  Work performed (43.9 draft)
                </div>
                <p className="whitespace-pre-line">{log.workPerformed}</p>
              </div>
            ) : null}
            {log.ataChapter ? (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-white/45">ATA</div>
                <p>{log.ataChapter}</p>
              </div>
            ) : null}
            {log.returnToServiceStatement ? (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-white/45">
                  Return to service
                </div>
                <p className="whitespace-pre-line">{log.returnToServiceStatement}</p>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
