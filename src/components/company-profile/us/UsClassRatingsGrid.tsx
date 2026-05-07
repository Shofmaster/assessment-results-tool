import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FAA_RATING_CATEGORIES,
  FAA_RATING_CLASSES,
  type FaaRatingCategoryId,
} from "../../../config/regulatoryTaxonomy";
import {
  useClassRatingsByCompany,
  useRemoveClassRating,
  useUpsertClassRating,
} from "../../../hooks/useConvexData";
import { isFaaAuthority } from "../authorityUtils";

type Props = { companyId: string };

export default function UsClassRatingsGrid({ companyId }: Props) {
  const rows = (useClassRatingsByCompany(companyId) as any[]) ?? [];
  const upsert = useUpsertClassRating();
  const remove = useRemoveClassRating();
  const faaRows = useMemo(() => rows.filter((r) => isFaaAuthority(r.authority)), [rows]);
  const [limitationsDraft, setLimitationsDraft] = useState<Record<string, string>>({});

  function key(cat: string, cls: number) {
    return `${cat}:${cls}`;
  }

  function findRow(cat: string, cls: number) {
    return faaRows.find(
      (r) => String(r.category).toLowerCase() === cat.toLowerCase() && Number(r.classNumber) === cls,
    );
  }

  async function toggleCell(category: FaaRatingCategoryId, classNumber: number, checked: boolean) {
    try {
      if (checked) {
        const lim = limitationsDraft[key(category, classNumber)]?.trim();
        await upsert({
          companyId: companyId as any,
          authority: "faa",
          category,
          classNumber,
          limitations: lim || undefined,
        } as any);
        toast.success(`${category} class ${classNumber} added`);
      } else {
        const row = findRow(category, classNumber);
        if (row?._id) {
          await remove({ companyId: companyId as any, ratingId: row._id } as any);
          toast.success(`${category} class ${classNumber} removed`);
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-white">Class ratings — §145.59</h4>
        <p className="text-[10px] text-white/50 mt-0.5">Select each class your station holds. Optional limitations per cell.</p>
      </div>
      <div className="overflow-x-auto space-y-4">
        {FAA_RATING_CATEGORIES.map(({ id: category }) => (
          <div key={category}>
            <p className="text-xs font-medium text-sky-200/90 capitalize mb-2">{category}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {FAA_RATING_CLASSES[category].map((opt) => {
                const row = findRow(category, opt.classNumber);
                const checked = Boolean(row);
                return (
                  <div
                    key={opt.classNumber}
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5"
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => void toggleCell(category, opt.classNumber, e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="text-[11px] text-white/75 leading-snug">{opt.label}</span>
                    </label>
                    {checked ? (
                      <input
                        className="w-full bg-black/20 border border-white/15 rounded px-2 py-1 text-[10px] text-white"
                        placeholder="Limitations (optional)"
                        value={limitationsDraft[key(category, opt.classNumber)] ?? row?.limitations ?? ""}
                        onChange={(e) =>
                          setLimitationsDraft((d) => ({
                            ...d,
                            [key(category, opt.classNumber)]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          const rowNow = findRow(category, opt.classNumber);
                          if (!rowNow) return;
                          const lim = limitationsDraft[key(category, opt.classNumber)]?.trim();
                          void upsert({
                            companyId: companyId as any,
                            authority: "faa",
                            category,
                            classNumber: opt.classNumber,
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
    </div>
  );
}
