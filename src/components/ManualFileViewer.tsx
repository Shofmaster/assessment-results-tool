import { useEffect, useMemo, useState } from 'react';
import { FiExternalLink } from 'react-icons/fi';

type Section = { id: string; title: string; content: string };

function toSectionId(title: string, index: number): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `section-${base || `part-${index + 1}`}`;
}

function buildSections(text: string): Section[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const headingPattern = /^(?:\d+(?:\.\d+)*[.)-]?\s+)?[A-Z][A-Z0-9 ,/&()-]{4,}$/gm;
  const matches = [...normalized.matchAll(headingPattern)];
  if (matches.length < 2) {
    return [{
      id: 'section-full-document',
      title: 'Full Document',
      content: normalized,
    }];
  }
  const sections: Section[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const start = current.index ?? 0;
    const end = next?.index ?? normalized.length;
    const block = normalized.slice(start, end).trim();
    const lines = block.split('\n');
    const title = lines[0]?.trim() || `Section ${i + 1}`;
    sections.push({
      id: toSectionId(title, i),
      title,
      content: lines.slice(1).join('\n').trim() || '(No extracted body text for this section.)',
    });
  }
  return sections;
}

function triggerDownload(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function ManualFileViewer({
  fileUrl,
  fileName,
  mimeType,
  extractedText,
}: {
  fileUrl: string | null;
  fileName: string;
  mimeType?: string;
  extractedText?: string;
}) {
  const [activeId, setActiveId] = useState<string>('');
  const sections = useMemo(() => buildSections(extractedText || ''), [extractedText]);
  const isPdf = Boolean(fileUrl && ((mimeType || '').includes('pdf') || fileName.toLowerCase().endsWith('.pdf')));

  useEffect(() => {
    if (sections.length === 0) return;
    const hash = window.location.hash.replace('#', '');
    const match = sections.find((section) => section.id === hash);
    setActiveId(match?.id || sections[0].id);
  }, [sections]);

  if (!fileUrl && sections.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/50">
        Select a revision file to preview the manual.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-white text-sm font-semibold truncate">Viewer: {fileName}</h4>
        {fileUrl && (
          <button
            type="button"
            onClick={() => triggerDownload(fileUrl, fileName)}
            className="inline-flex items-center gap-1 text-xs text-sky-lighter hover:text-sky-lighter/80"
          >
            <FiExternalLink className="text-[11px]" />
            Open in new tab
          </button>
        )}
      </div>

      {isPdf && fileUrl ? (
        <iframe title={`${fileName} preview`} src={fileUrl} className="w-full h-[440px] rounded-lg border border-white/10 bg-black/20" />
      ) : (
        <div className="text-xs text-white/50 px-1">
          Original file preview is limited for this format. Text view is shown below.
        </div>
      )}

      {sections.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-1 rounded-lg border border-white/10 bg-black/20 p-2 max-h-[360px] overflow-auto">
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Sections</p>
            <div className="space-y-1">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={() => setActiveId(section.id)}
                  className={`block rounded px-2 py-1 text-xs transition-colors ${
                    activeId === section.id ? 'bg-sky/20 text-sky-lighter' : 'text-white/60 hover:bg-white/10'
                  }`}
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>
          <div className="lg:col-span-3 rounded-lg border border-white/10 bg-black/20 p-3 max-h-[360px] overflow-auto space-y-4">
            {sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h5 className="text-white text-sm font-semibold mb-1">{section.title}</h5>
                <pre className="whitespace-pre-wrap break-words text-xs text-white/70 font-sans">{section.content}</pre>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
