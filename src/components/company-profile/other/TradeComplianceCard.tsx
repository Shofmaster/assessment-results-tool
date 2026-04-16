import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CMMC_LEVELS } from "../../../config/regulatoryTaxonomy";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 w-full";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function TradeComplianceCard({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [cmmcLevel, setCmmcLevel] = useState("");
  const [itar, setItar] = useState(false);
  const [dfars, setDfars] = useState(false);
  const [defense, setDefense] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = profile as any;
    setCmmcLevel(typeof p?.cmmcLevel === "string" ? p.cmmcLevel : "");
    setItar(p?.itarRegistered === true);
    setDfars(p?.dfarsCompliant === true);
    setDefense(p?.isDefenseContractor === true);
  }, [profile?._id, (profile as any)?.updatedAt]);

  async function save() {
    setSaving(true);
    try {
      await upsert({
        companyId: companyId as any,
        cmmcLevel: cmmcLevel || undefined,
        itarRegistered: itar,
        dfarsCompliant: dfars,
        isDefenseContractor: defense,
      } as any);
      toast.success("Trade compliance saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-emerald-100">CMMC / ITAR / DFARS</h4>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="px-2 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-xs text-emerald-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div>
        <label className="block text-[10px] text-white/45 mb-1">CMMC level</label>
        <select className={inputCls} value={cmmcLevel} onChange={(e) => setCmmcLevel(e.target.value)}>
          <option value="">Not assessed / not applicable</option>
          {CMMC_LEVELS.map((l) => (
            <option key={l.id} value={l.id} className="bg-slate-900">
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-white/80">
        <input type="checkbox" checked={itar} onChange={(e) => setItar(e.target.checked)} />
        ITAR registered / US-person obligations
      </label>
      <label className="flex items-center gap-2 text-xs text-white/80">
        <input type="checkbox" checked={dfars} onChange={(e) => setDfars(e.target.checked)} />
        DFARS / defense contracting flow-down
      </label>
      <label className="flex items-center gap-2 text-xs text-white/80">
        <input type="checkbox" checked={defense} onChange={(e) => setDefense(e.target.checked)} />
        Defense contractor (FAR/DFARS workload)
      </label>
    </div>
  );
}
