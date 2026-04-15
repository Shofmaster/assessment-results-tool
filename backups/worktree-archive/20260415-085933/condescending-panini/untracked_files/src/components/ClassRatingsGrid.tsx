/**
 * ClassRatingsGrid — 6×4 checkbox grid for FAA Part 145 class ratings (§145.59).
 * Checking a cell calls addOrUpdate; unchecking calls remove.
 * Limitation notes expand inline when a class is checked.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useAddOrUpdateClassRating, useRemoveClassRating } from "../hooks/useConvexData";

type RatingCategory = "airframe" | "powerplant" | "propeller" | "radio" | "instrument" | "accessory";
type ClassNumber = 1 | 2 | 3 | 4;

interface ClassRatingDoc {
  _id: string;
  category: RatingCategory;
  classNumber: ClassNumber;
  limitations?: string;
}

interface Props {
  entityProfileId: string;
  projectId?: string;
  companyId?: string;
  ratings: ClassRatingDoc[];
}

const CATEGORIES: Array<{ key: RatingCategory; label: string; maxClass: 4 | 3 | 2 }> = [
  { key: "airframe",   label: "Airframe",   maxClass: 4 },
  { key: "powerplant", label: "Powerplant", maxClass: 3 },
  { key: "propeller",  label: "Propeller",  maxClass: 2 },
  { key: "radio",      label: "Radio",      maxClass: 3 },
  { key: "instrument", label: "Instrument", maxClass: 4 },
  { key: "accessory",  label: "Accessory",  maxClass: 3 },
];

const CLASS_DESCRIPTIONS: Record<RatingCategory, Record<ClassNumber, string>> = {
  airframe: {
    1: "Composite/wood/fabric construction",
    2: "Single-engine ≤12,500 lbs",
    3: "Multi-engine or >12,500 lbs",
    4: "Any airframe (transport category)",
  },
  powerplant: {
    1: "Reciprocating ≤400 hp",
    2: "Reciprocating >400 hp",
    3: "Turbine engines",
    4: "—",
  },
  propeller: {
    1: "Fixed/semi-fixed pitch",
    2: "All propellers (variable pitch)",
    3: "—",
    4: "—",
  },
  radio: {
    1: "General avionics",
    2: "Communications equipment only",
    3: "Radar systems",
    4: "—",
  },
  instrument: {
    1: "Mechanical instruments (altimeters, pitot-static)",
    2: "Electrical instruments",
    3: "Gyroscopic/inertial instruments",
    4: "Electronic displays (EFIS/EICAS)",
  },
  accessory: {
    1: "Hydraulic, fuel & oil components",
    2: "Electrical/electronic accessories",
    3: "Avionics/aircraft electronics",
    4: "—",
  },
};

export default function ClassRatingsGrid({ entityProfileId, projectId, companyId, ratings }: Props) {
  const addOrUpdate = useAddOrUpdateClassRating();
  const removeRating = useRemoveClassRating();

  // Local state for limitation text editing (keyed by "category-classNumber")
  const [limitationDrafts, setLimitationDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const heldMap = new Map<string, ClassRatingDoc>(
    ratings.map((r) => [`${r.category}-${r.classNumber}`, r])
  );

  function cellKey(cat: RatingCategory, cls: ClassNumber) {
    return `${cat}-${cls}`;
  }

  async function handleToggle(cat: RatingCategory, cls: ClassNumber, checked: boolean) {
    const key = cellKey(cat, cls);
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      if (checked) {
        await addOrUpdate({
          entityProfileId: entityProfileId as any,
          ...(projectId ? { projectId: projectId as any } : {}),
          ...(companyId ? { companyId: companyId as any } : {}),
          category: cat,
          classNumber: cls,
          limitations: limitationDrafts[key] || undefined,
        });
      } else {
        const existing = heldMap.get(key);
        if (existing) {
          await removeRating({
            ratingId: existing._id as any,
            ...(projectId ? { projectId: projectId as any } : {}),
            ...(companyId ? { companyId: companyId as any } : {}),
          });
        }
        setLimitationDrafts((d) => { const copy = { ...d }; delete copy[key]; return copy; });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update rating");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  async function handleLimitationBlur(cat: RatingCategory, cls: ClassNumber) {
    const key = cellKey(cat, cls);
    const held = heldMap.get(key);
    if (!held) return; // Not checked — no-op
    const draft = limitationDrafts[key] ?? held.limitations ?? "";
    if (draft === (held.limitations ?? "")) return; // No change
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await addOrUpdate({
        entityProfileId: entityProfileId as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
        category: cat,
        classNumber: cls,
        limitations: draft || undefined,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save limitation");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left text-white/60 font-medium pb-2 pr-4 w-28">Category</th>
            {[1, 2, 3, 4].map((cls) => (
              <th key={cls} className="text-center text-white/60 font-medium pb-2 px-2 min-w-[120px]">
                Class {cls}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(({ key: cat, label, maxClass }) => (
            <tr key={cat} className="border-t border-white/8">
              <td className="py-2 pr-4 text-white/80 font-medium text-sm whitespace-nowrap">{label}</td>
              {([1, 2, 3, 4] as ClassNumber[]).map((cls) => {
                const isAvailable = cls <= maxClass;
                if (!isAvailable) {
                  return (
                    <td key={cls} className="px-2 py-2 text-center">
                      <span className="text-white/20 text-xs">—</span>
                    </td>
                  );
                }
                const key = cellKey(cat, cls);
                const held = heldMap.get(key);
                const isChecked = Boolean(held);
                const isSaving = saving[key];
                const description = CLASS_DESCRIPTIONS[cat][cls];
                const limitationVal = limitationDrafts[key] ?? held?.limitations ?? "";

                return (
                  <td key={cls} className="px-2 py-2 align-top">
                    <label className="flex flex-col gap-1 cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isSaving}
                          onChange={(e) => handleToggle(cat, cls, e.target.checked)}
                          className="w-4 h-4 rounded border border-white/30 bg-white/10 text-sky-400 cursor-pointer accent-sky-400"
                        />
                        <span className={`text-xs leading-tight ${isChecked ? "text-white/80" : "text-white/40"}`}>
                          {description !== "—" ? description : "Not applicable"}
                        </span>
                      </div>
                      {isChecked && (
                        <input
                          value={limitationVal}
                          onChange={(e) =>
                            setLimitationDrafts((d) => ({ ...d, [key]: e.target.value }))
                          }
                          onBlur={() => handleLimitationBlur(cat, cls)}
                          placeholder="Limitation notes (optional)"
                          className="ml-6 text-xs bg-white/5 border border-white/15 rounded px-2 py-1 text-white/70 placeholder-white/25 focus:outline-none focus:border-sky-400/40 w-full max-w-[200px]"
                        />
                      )}
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-white/35">
        Check each class rating held per 14 CFR §145.59. These drive which DCT elements are applicable to your station.
      </p>
    </div>
  );
}
