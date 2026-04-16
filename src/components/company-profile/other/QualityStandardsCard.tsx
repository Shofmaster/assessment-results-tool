import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AS9100_FAMILY, NADCAP_PROCESSES } from "../../../config/regulatoryTaxonomy";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function QualityStandardsCard({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [quality, setQuality] = useState<string[]>([]);
  const [nadcap, setNadcap] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = profile as any;
    setQuality(Array.isArray(p?.qualityStandards) ? [...p.qualityStandards] : []);
    setNadcap(Array.isArray(p?.nadcapAccreditations) ? [...p.nadcapAccreditations] : []);
  }, [profile?._id, (profile as any)?.updatedAt]);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function save() {
    setSaving(true);
    try {
      await upsert({
        companyId: companyId as any,
        qualityStandards: quality.length ? quality : undefined,
        nadcapAccreditations: nadcap.length ? nadcap : undefined,
      } as any);
      toast.success("Quality & NADCAP saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-emerald-100">AS9100 family & NADCAP</h4>
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
        <p className="text-[10px] text-white/50 mb-2">Aerospace QMS standards</p>
        <div className="flex flex-wrap gap-2">
          {AS9100_FAMILY.map((x) => (
            <label
              key={x.id}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/75 cursor-pointer"
            >
              <input type="checkbox" checked={quality.includes(x.id)} onChange={() => toggle(quality, setQuality, x.id)} />
              {x.label}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-white/50 mb-2">NADCAP special processes</p>
        <div className="flex flex-wrap gap-2">
          {NADCAP_PROCESSES.map((x) => (
            <label
              key={x.id}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/75 cursor-pointer"
            >
              <input type="checkbox" checked={nadcap.includes(x.id)} onChange={() => toggle(nadcap, setNadcap, x.id)} />
              {x.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
