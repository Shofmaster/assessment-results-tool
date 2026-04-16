import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ISBAO_LEVELS, NASA_STD_LEVELS } from "../../../config/regulatoryTaxonomy";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 w-full";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function IsbaoAndIcaoCard({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [isbaoLevel, setIsbaoLevel] = useState("");
  const [icao, setIcao] = useState("");
  const [nasa, setNasa] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = profile as any;
    setIsbaoLevel(typeof p?.isbaoLevel === "string" ? p.isbaoLevel : "");
    setIcao(typeof p?.icaoStateOfRegistry === "string" ? p.icaoStateOfRegistry : "");
    const sp = p?.spacePrograms;
    setNasa(Array.isArray(sp) ? sp.filter((x: unknown): x is string => typeof x === "string") : []);
  }, [profile?._id, (profile as any)?.updatedAt]);

  function toggleNasa(id: string) {
    setNasa((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save() {
    setSaving(true);
    try {
      await upsert({
        companyId: companyId as any,
        isbaoLevel: isbaoLevel || undefined,
        icaoStateOfRegistry: icao.trim() || undefined,
        spacePrograms: nasa.length ? nasa : undefined,
      } as any);
      toast.success("ICAO / IS-BAO / programs saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-emerald-100">ICAO / IS-BAO / NASA</h4>
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
        <label className="block text-[10px] text-white/45 mb-1">IS-BAO stage</label>
        <select className={inputCls} value={isbaoLevel} onChange={(e) => setIsbaoLevel(e.target.value)}>
          {ISBAO_LEVELS.map((l) => (
            <option key={l.id} value={l.id} className="bg-slate-900">
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] text-white/45 mb-1">ICAO / state-of-registry notes</label>
        <textarea
          className={inputCls + " min-h-[4rem]"}
          placeholder="Primary registry states, bilateral notes, foreign approvals…"
          value={icao}
          onChange={(e) => setIcao(e.target.value)}
        />
      </div>
      <div>
        <p className="text-[10px] text-white/50 mb-2">Space / NASA program tags (uses spacePrograms field)</p>
        <div className="flex flex-wrap gap-2">
          {NASA_STD_LEVELS.map((x) => (
            <label
              key={x.id}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/75 cursor-pointer"
            >
              <input type="checkbox" checked={nasa.includes(x.id)} onChange={() => toggleNasa(x.id)} />
              {x.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
