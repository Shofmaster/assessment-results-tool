import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EASA_SCOPE_CATEGORIES, type EasaScopeEntry } from "../../../config/regulatoryTaxonomy";
import {
  useClassRatingsByCompany,
  useRemoveClassRating,
  useUpsertClassRating,
} from "../../../hooks/useConvexData";
import { isEasaAuthority } from "../authorityUtils";

type Props = { companyId: string };

export default function EasaScopeMatrix({ companyId }: Props) {
  const rows = (useClassRatingsByCompany(companyId) as any[]) ?? [];
  const easaRows = useMemo(() => rows.filter((r) => isEasaAuthority(r.authority)), [rows]);
  const upsert = useUpsertClassRating();
  const remove = useRemoveClassRating();
  const [limDraft, setLimDraft] = useState<Record<string, string>>({});

  function findRow(code: string) {
    return easaRows.find((r) => String(r.category).toUpperCase() === code.toUpperCase());
  }

  async function toggle(code: string, checked: boolean) {
    try {
      if (checked) {
        const lim = limDraft[code]?.trim();
        await upsert({
          companyId: companyId as any,
          authority: "easa",
          category: code,
          classNumber: 1,
          limitations: lim || undefined,
        } as any);
      } else {
        const row = findRow(code);
        if (row?._id) await remove({ companyId: companyId as any, ratingId: row._id } as any);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  }

  const byGroup = useMemo(() => {
    const m: Record<"A" | "B" | "C" | "D", EasaScopeEntry[]> = {
      A: [],
      B: [],
      C: [],
      D: [],
    };
    for (const e of EASA_SCOPE_CATEGORIES) {
      m[e.group].push(e);
    }
    return m;
  }, []);

  return (
    <div className="rounded-lg border border-amber-400/15 bg-amber-500/5 p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-amber-100">Scope of approval — Part-145</h4>
        <p className="text-[10px] text-amber-100/60 mt-0.5">Categories A/B/C/D per Form 3 matrix (Annex II).</p>
      </div>
      {(["A", "B", "C", "D"] as const).map((g) => (
        <div key={g}>
          <p className="text-xs font-medium text-amber-200/90 mb-2">Category {g}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(byGroup[g] ?? []).map((entry) => {
              const row = findRow(entry.code);
              const checked = Boolean(row);
              return (
                <div key={entry.code} className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-1">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => void toggle(entry.code, e.target.checked)}
                    />
                    <span className="text-[11px] text-white/80">
                      <span className="font-semibold text-amber-100/90">{entry.code}</span> — {entry.description}
                    </span>
                  </label>
                  {checked ? (
                    <input
                      className="w-full bg-black/30 border border-white/15 rounded px-2 py-1 text-[10px] text-white"
                      placeholder="Limitations / conditions"
                      value={limDraft[entry.code] ?? row?.limitations ?? ""}
                      onChange={(e) => setLimDraft((d) => ({ ...d, [entry.code]: e.target.value }))}
                      onBlur={() => {
                        const r = findRow(entry.code);
                        if (!r) return;
                        const lim = limDraft[entry.code]?.trim();
                        void upsert({
                          companyId: companyId as any,
                          authority: "easa",
                          category: entry.code,
                          classNumber: 1,
                          limitations: lim || undefined,
                        } as any).catch(() => {});
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
