import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { FaaAuthEntry, FaaCertPart } from "../../../config/regulatoryTaxonomy";
import { FAA_AUTH_CATALOG_BY_PART } from "../../../config/regulatoryTaxonomy";
import { useOpSpecsByCompany, useUpsertOpSpec } from "../../../hooks/useConvexData";

type Props = {
  companyId: string;
  certPart: FaaCertPart;
};

/**
 * Per-paragraph checklist for one FAA authorization document catalog
 * (OpSpecs / MSpecs / TSpecs / LOAs). Rendered once per certificate type
 * the company holds. All rows are stored in the `entityOpSpecs` table and
 * discriminated by `certPart`.
 */
export default function UsFaaAuthChecklist({ companyId, certPart }: Props) {
  const catalog = FAA_AUTH_CATALOG_BY_PART[certPart];
  const rows = (useOpSpecsByCompany(companyId) as any[]) ?? [];
  const upsert = useUpsertOpSpec();
  const [showRarelyUsed, setShowRarelyUsed] = useState(false);

  const scopedRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (r.authority === undefined || r.authority === "faa") &&
          // Legacy rows (pre-migration) without `certPart` default to "145".
          (r.certPart ?? "145") === certPart,
      ),
    [rows, certPart],
  );

  const visibleParagraphs = useMemo(() => {
    const all = catalog?.paragraphs ?? [];
    return showRarelyUsed ? all : all.filter((p) => !p.rarelyUsed);
  }, [catalog, showRarelyUsed]);

  const rareCount = useMemo(
    () => (catalog?.paragraphs ?? []).filter((p) => p.rarelyUsed).length,
    [catalog],
  );

  if (!catalog) return null;

  function rowForParagraph(p: string) {
    return scopedRows.find((r) => String(r.paragraph) === p);
  }

  async function setParagraphActive(entry: FaaAuthEntry, isActive: boolean) {
    try {
      await upsert({
        companyId: companyId as any,
        authority: "faa",
        certPart,
        docType: catalog.docType,
        paragraph: entry.paragraph,
        title: entry.title,
        isActive,
      } as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  }

  const activeCount = scopedRows.filter((r) => r.isActive === true).length;

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-white">{catalog.label}</h4>
          <p className="text-[10px] text-white/50 mt-0.5">
            {catalog.regBase}
            {catalog.description ? ` — ${catalog.description}` : ""}
          </p>
        </div>
        <span className="text-[10px] text-white/55">
          {activeCount} of {catalog.paragraphs.length} active
        </span>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto">
        {visibleParagraphs.map((spec) => {
          const row = rowForParagraph(spec.paragraph);
          const checked = row ? row.isActive === true : false;
          return (
            <label
              key={spec.paragraph}
              className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 cursor-pointer hover:bg-white/[0.06] transition-colors"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={checked}
                onChange={(e) => void setParagraphActive(spec, e.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-white/90">
                  {spec.paragraph} — {spec.title}
                </span>
                {spec.helpText ? (
                  <p className="text-[10px] text-white/45 mt-0.5">{spec.helpText}</p>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>
      {rareCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowRarelyUsed((s) => !s)}
          className="text-[11px] text-sky-200/80 hover:text-sky-100 underline-offset-2 hover:underline"
        >
          {showRarelyUsed ? "Hide rarely used paragraphs" : `Show ${rareCount} rarely used paragraphs`}
        </button>
      ) : null}
    </div>
  );
}
