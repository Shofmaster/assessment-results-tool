/**
 * OpSpecsChecklist — FAA Part 145 Operations Specifications paragraph checklist.
 * Displays standard paragraphs with toggle, accepted date, and notes.
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAddOrUpdateOpSpec, useRemoveOpSpec } from "../hooks/useConvexData";
import { STANDARD_OPSPECS } from "../../convex/entityOpSpecs";

interface OpSpecDoc {
  _id: string;
  paragraph: string;
  title?: string;
  acceptedDate?: string;
  expiryDate?: string;
  notes?: string;
  isActive: boolean;
}

interface Props {
  entityProfileId: string;
  projectId?: string;
  companyId?: string;
  opSpecs: OpSpecDoc[];
}

const OPSPEC_DESCRIPTIONS: Record<string, string> = {
  A001: "Required for all repair stations. General certificate information including name, address, and ratings summary.",
  A002: "Defines class ratings held under §145.59. Always present — scope determines which DCT elements apply.",
  A003: "Specific (limited) ratings under §145.61. Tied to specific make/model; requires Capability List.",
  A025: "Specific maintenance function authorizations beyond standard class ratings.",
  A049: "Authorization to handle hazardous materials per HAZMAT regulations.",
  A050: "Grants deviation authority from certain Part 145 requirements under specific conditions.",
  A060: "Special maintenance authorizations not covered by standard ratings.",
  A449: "Drug and Alcohol Testing Program per 14 CFR Part 120. Required for most certificated stations.",
  D100: "Authorizes maintenance performed away from the fixed certificated location (line maintenance, on-site work).",
};

export default function OpSpecsChecklist({ entityProfileId, projectId, companyId, opSpecs }: Props) {
  const addOrUpdate = useAddOrUpdateOpSpec();
  const removeOpSpec = useRemoveOpSpec();

  // Map paragraph → doc
  const opSpecMap = new Map<string, OpSpecDoc>(opSpecs.map((s) => [s.paragraph, s]));

  // Local draft state for date/notes fields
  const [drafts, setDrafts] = useState<Record<string, { acceptedDate: string; expiryDate: string; notes: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Initialize drafts from existing docs
  useEffect(() => {
    const init: typeof drafts = {};
    for (const s of opSpecs) {
      init[s.paragraph] = {
        acceptedDate: s.acceptedDate ?? "",
        expiryDate: s.expiryDate ?? "",
        notes: s.notes ?? "",
      };
    }
    setDrafts(init);
  }, [opSpecs.map((s) => s._id).join(",")]); // re-init when docs change

  function getDraft(para: string) {
    return drafts[para] ?? { acceptedDate: "", expiryDate: "", notes: "" };
  }

  async function handleToggle(paragraph: string, title: string, checked: boolean) {
    setSaving((s) => ({ ...s, [paragraph]: true }));
    try {
      const d = getDraft(paragraph);
      if (checked) {
        await addOrUpdate({
          entityProfileId: entityProfileId as any,
          ...(projectId ? { projectId: projectId as any } : {}),
          ...(companyId ? { companyId: companyId as any } : {}),
          paragraph,
          title,
          acceptedDate: d.acceptedDate || undefined,
          expiryDate: d.expiryDate || undefined,
          notes: d.notes || undefined,
          isActive: true,
        });
      } else {
        const existing = opSpecMap.get(paragraph);
        if (existing) {
          await removeOpSpec({
            opSpecId: existing._id as any,
            ...(projectId ? { projectId: projectId as any } : {}),
            ...(companyId ? { companyId: companyId as any } : {}),
          });
        }
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update OpSpec");
    } finally {
      setSaving((s) => ({ ...s, [paragraph]: false }));
    }
  }

  async function handleFieldBlur(paragraph: string, title: string) {
    const existing = opSpecMap.get(paragraph);
    if (!existing?.isActive) return;
    const d = getDraft(paragraph);
    setSaving((s) => ({ ...s, [paragraph]: true }));
    try {
      await addOrUpdate({
        entityProfileId: entityProfileId as any,
        ...(projectId ? { projectId: projectId as any } : {}),
        ...(companyId ? { companyId: companyId as any } : {}),
        paragraph,
        title,
        acceptedDate: d.acceptedDate || undefined,
        expiryDate: d.expiryDate || undefined,
        notes: d.notes || undefined,
        isActive: true,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save OpSpec");
    } finally {
      setSaving((s) => ({ ...s, [paragraph]: false }));
    }
  }

  return (
    <div className="space-y-2">
      {STANDARD_OPSPECS.map(({ paragraph, title }) => {
        const existing = opSpecMap.get(paragraph);
        const isActive = existing?.isActive ?? false;
        const isSaving = saving[paragraph];
        const d = getDraft(paragraph);
        const description = OPSPEC_DESCRIPTIONS[paragraph];

        return (
          <div
            key={paragraph}
            className={`rounded-lg border transition-colors ${
              isActive
                ? "border-sky-400/30 bg-sky/8"
                : "border-white/10 bg-white/3"
            }`}
          >
            <label className="flex items-start gap-3 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                disabled={isSaving}
                onChange={(e) => handleToggle(paragraph, title, e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border border-white/30 bg-white/10 text-sky-400 cursor-pointer accent-sky-400 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sky-300 text-sm font-semibold">{paragraph}</span>
                  <span className={`text-sm font-medium ${isActive ? "text-white" : "text-white/55"}`}>
                    {title}
                  </span>
                  {isSaving && (
                    <span className="text-xs text-white/35 animate-pulse">saving…</span>
                  )}
                </div>
                {description && (
                  <p className="text-xs text-white/40 mt-0.5 leading-snug">{description}</p>
                )}
              </div>
            </label>

            {isActive && (
              <div className="px-3 pb-3 grid gap-2 sm:grid-cols-3 border-t border-white/8 pt-2">
                <div>
                  <label className="block text-xs text-white/45 mb-1">Accepted date</label>
                  <input
                    type="date"
                    value={d.acceptedDate}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [paragraph]: { ...getDraft(paragraph), acceptedDate: e.target.value },
                      }))
                    }
                    onBlur={() => handleFieldBlur(paragraph, title)}
                    className="w-full bg-white/5 border border-white/15 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-sky-400/40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/45 mb-1">Expiry / revision date</label>
                  <input
                    type="date"
                    value={d.expiryDate}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [paragraph]: { ...getDraft(paragraph), expiryDate: e.target.value },
                      }))
                    }
                    onBlur={() => handleFieldBlur(paragraph, title)}
                    className="w-full bg-white/5 border border-white/15 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-sky-400/40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/45 mb-1">Notes</label>
                  <input
                    value={d.notes}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [paragraph]: { ...getDraft(paragraph), notes: e.target.value },
                      }))
                    }
                    onBlur={() => handleFieldBlur(paragraph, title)}
                    placeholder="Optional notes"
                    className="w-full bg-white/5 border border-white/15 rounded px-2 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-sky-400/40"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-white/35 pt-1">
        Check each OpSpec paragraph accepted per 14 CFR Part 145. These determine which DCT elements are scoped in for your station.
      </p>
    </div>
  );
}
