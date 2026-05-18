import { useState, useRef, useEffect } from 'react';
import { FiUsers } from 'react-icons/fi';

export default function CompanyContextPopover({
  entityProfile,
  rosterPersonnel,
  opSpecs,
  capabilityItems,
  manuals,
  sharedReferenceDocs,
  onInsertManualTitle,
}: {
  entityProfile: {
    companyName?: string;
    faaCertificateNumber?: string;
    easaApprovalRef?: string;
  } | null | undefined;
  rosterPersonnel: { fullName?: string; certificateNumber?: string }[];
  opSpecs: { certPart?: string; paragraph?: string; title?: string }[];
  capabilityItems: { articleDescription?: string; authorizedFunctions?: string[] }[];
  manuals: { title?: string; currentRevision?: string }[];
  sharedReferenceDocs: { name?: string; documentType?: string }[];
  onInsertManualTitle?: (title: string, revision?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const q = search.toLowerCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          open
            ? 'border-sky/40 bg-sky/15 text-sky-light'
            : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
        }`}
      >
        <FiUsers className="text-sm" />
        Context
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[min(360px,calc(100vw-2rem))] max-h-[70vh] flex flex-col rounded-xl border border-white/10 bg-navy-900 shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex-shrink-0">
            <p className="text-xs font-semibold text-white/75 mb-2">Company context (read-only)</p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter names, certs, manuals…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-sky/40"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs text-white/70">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Repair station</p>
              <p>{entityProfile?.companyName || 'No company profile selected'}</p>
              <p className="text-white/50">FAA cert: {entityProfile?.faaCertificateNumber || '—'}</p>
              <p className="text-white/50">EASA: {entityProfile?.easaApprovalRef || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Roster</p>
              {rosterPersonnel
                .filter((p) => !q || `${p.fullName} ${p.certificateNumber ?? ''}`.toLowerCase().includes(q))
                .slice(0, 15)
                .map((p, idx) => (
                  <p key={`${p.fullName}-${idx}`} className="text-white/60">
                    {p.fullName} {p.certificateNumber ? `(${p.certificateNumber})` : ''}
                  </p>
                ))}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">OpSpecs / capabilities</p>
              {opSpecs
                .filter((o) => !q || `${o.paragraph ?? ''} ${o.title ?? ''}`.toLowerCase().includes(q))
                .slice(0, 8)
                .map((o, idx) => (
                  <p key={`${o.paragraph}-${idx}`} className="text-white/60">
                    {o.certPart || '—'} {o.paragraph || ''} {o.title ? `- ${o.title}` : ''}
                  </p>
                ))}
              {capabilityItems
                .filter(
                  (c) =>
                    !q ||
                    `${c.articleDescription ?? ''} ${(c.authorizedFunctions ?? []).join(' ')}`.toLowerCase().includes(q),
                )
                .slice(0, 6)
                .map((c, idx) => (
                  <p key={`${c.articleDescription}-${idx}`} className="text-white/50">
                    {c.articleDescription}
                  </p>
                ))}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Manuals / references</p>
              {manuals
                .filter((m) => !q || `${m.title ?? ''} ${m.currentRevision ?? ''}`.toLowerCase().includes(q))
                .slice(0, 8)
                .map((m, idx) =>
                  onInsertManualTitle ? (
                    <button
                      key={`${m.title}-${idx}`}
                      type="button"
                      onClick={() => {
                        onInsertManualTitle(m.title ?? '', m.currentRevision);
                        setOpen(false);
                      }}
                      className="block text-left text-sky-light/80 hover:text-sky-light mb-1"
                    >
                      {m.title} {m.currentRevision ? `(Rev ${m.currentRevision})` : ''}
                    </button>
                  ) : (
                    <p key={`${m.title}-${idx}`} className="text-white/50">
                      {m.title} {m.currentRevision ? `(Rev ${m.currentRevision})` : ''}
                    </p>
                  ),
                )}
              {sharedReferenceDocs
                .filter((d) => !q || `${d.name ?? ''} ${d.documentType ?? ''}`.toLowerCase().includes(q))
                .slice(0, 6)
                .map((d, idx) => (
                  <p key={`${d.name}-${idx}`} className="text-white/50">
                    {d.name}
                  </p>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
