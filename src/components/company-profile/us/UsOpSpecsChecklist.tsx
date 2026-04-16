import { useMemo } from "react";
import { toast } from "sonner";
import { FAA_PART145_OPSPECS } from "../../../config/regulatoryTaxonomy";
import { useOpSpecsByCompany, useUpsertOpSpec } from "../../../hooks/useConvexData";

type Props = { companyId: string };

export default function UsOpSpecsChecklist({ companyId }: Props) {
  const rows = (useOpSpecsByCompany(companyId) as any[]) ?? [];
  const faaRows = useMemo(() => rows.filter((r) => !r.authority || r.authority === "faa"), [rows]);
  const upsert = useUpsertOpSpec();

  function rowForParagraph(p: string) {
    return faaRows.find((r) => String(r.paragraph) === p);
  }

  async function setParagraphActive(paragraph: string, isActive: boolean) {
    try {
      await upsert({
        companyId: companyId as any,
        authority: "faa",
        paragraph,
        isActive,
      } as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-white">Operations specifications (Part 145)</h4>
        <p className="text-[10px] text-white/50 mt-0.5">FAA Order 8900.1 Vol 2 Ch 3 — track accepted paragraphs.</p>
      </div>
      <div className="space-y-2 max-h-64 overflow-auto">
        {FAA_PART145_OPSPECS.map((spec) => {
          const row = rowForParagraph(spec.paragraph);
          const checked = row ? row.isActive === true : false;
          return (
            <label
              key={spec.paragraph}
              className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => void setParagraphActive(spec.paragraph, e.target.checked)}
              />
              <div className="min-w-0">
                <span className="text-xs font-medium text-white/90">
                  {spec.paragraph} — {spec.title}
                </span>
                {spec.helpText ? <p className="text-[10px] text-white/45 mt-0.5">{spec.helpText}</p> : null}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
