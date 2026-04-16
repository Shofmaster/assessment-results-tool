import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  EASA_PART_147_OPTIONS,
  EASA_PART_21_OPTIONS,
  EASA_PART_CAMO_OPTIONS,
  EASA_PART_CAO_OPTIONS,
  EASA_PART_M_SUBPART_F,
} from "../../../config/regulatoryTaxonomy";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 w-full";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function EasaOtherApprovals({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [form, setForm] = useState({
    easaPartCamoRef: "",
    easaPartCaoRef: "",
    easaPart147Ref: "",
    easaPart21Ref: "",
    camoSel: "",
    caoSel: "",
    mSubF: "",
    part147: "",
    part21: "",
    lineBases: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    const bases = Array.isArray(p.easaLineMaintenanceBases) ? p.easaLineMaintenanceBases.join("\n") : "";
    setForm({
      easaPartCamoRef: p.easaPartCamoRef ?? "",
      easaPartCaoRef: p.easaPartCaoRef ?? "",
      easaPart147Ref: p.easaPart147Ref ?? "",
      easaPart21Ref: p.easaPart21Ref ?? "",
      camoSel: "",
      caoSel: "",
      mSubF: "",
      part147: "",
      part21: "",
      lineBases: bases,
    });
  }, [profile?._id, (profile as any)?.updatedAt]);

  async function save() {
    setSaving(true);
    try {
      const lines = form.lineBases
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      await upsert({
        companyId: companyId as any,
        easaPartCamoRef: form.easaPartCamoRef.trim() || undefined,
        easaPartCaoRef: form.easaPartCaoRef.trim() || undefined,
        easaPart147Ref: form.easaPart147Ref.trim() || undefined,
        easaPart21Ref: form.easaPart21Ref.trim() || undefined,
        easaLineMaintenanceBases: lines.length ? lines : undefined,
      } as any);
      toast.success("EASA approvals saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-400/15 bg-amber-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-amber-100">Part-CAMO / Part-CAO / Part-M / Part-147 / Part-21</h4>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="px-2 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-xs text-amber-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-[10px] text-amber-100/55">Use dropdowns as prompts; free-text refs capture approval numbers.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className={inputCls}
          value={form.camoSel}
          onChange={(e) => setForm((s) => ({ ...s, camoSel: e.target.value }))}
        >
          <option value="">Part-CAMO (tag)</option>
          {EASA_PART_CAMO_OPTIONS.map((o) => (
            <option key={o.id} value={o.id} className="bg-slate-900">
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="Part-CAMO approval ref"
          value={form.easaPartCamoRef}
          onChange={(e) => setForm((s) => ({ ...s, easaPartCamoRef: e.target.value }))}
        />
        <select
          className={inputCls}
          value={form.caoSel}
          onChange={(e) => setForm((s) => ({ ...s, caoSel: e.target.value }))}
        >
          <option value="">Part-CAO (tag)</option>
          {EASA_PART_CAO_OPTIONS.map((o) => (
            <option key={o.id} value={o.id} className="bg-slate-900">
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="Part-CAO approval ref"
          value={form.easaPartCaoRef}
          onChange={(e) => setForm((s) => ({ ...s, easaPartCaoRef: e.target.value }))}
        />
        <select
          className={inputCls}
          value={form.mSubF}
          onChange={(e) => setForm((s) => ({ ...s, mSubF: e.target.value }))}
        >
          <option value="">Part-M Subpart F</option>
          {EASA_PART_M_SUBPART_F.map((o) => (
            <option key={o.id} value={o.id} className="bg-slate-900">
              {o.label}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={form.part147}
          onChange={(e) => setForm((s) => ({ ...s, part147: e.target.value }))}
        >
          <option value="">Part-147</option>
          {EASA_PART_147_OPTIONS.map((o) => (
            <option key={o.id} value={o.id} className="bg-slate-900">
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={inputCls + " sm:col-span-2"}
          placeholder="Part-147 approval ref"
          value={form.easaPart147Ref}
          onChange={(e) => setForm((s) => ({ ...s, easaPart147Ref: e.target.value }))}
        />
        <select
          className={inputCls}
          value={form.part21}
          onChange={(e) => setForm((s) => ({ ...s, part21: e.target.value }))}
        >
          <option value="">Part-21</option>
          {EASA_PART_21_OPTIONS.map((o) => (
            <option key={o.id} value={o.id} className="bg-slate-900">
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="Part-21 DOA/POA ref"
          value={form.easaPart21Ref}
          onChange={(e) => setForm((s) => ({ ...s, easaPart21Ref: e.target.value }))}
        />
        <div className="sm:col-span-2">
          <label className="block text-[10px] text-white/45 mb-1">Line maintenance bases (one per line)</label>
          <textarea
            className={inputCls + " min-h-[4rem]"}
            placeholder="ICAO location codes or station names…"
            value={form.lineBases}
            onChange={(e) => setForm((s) => ({ ...s, lineBases: e.target.value }))}
          />
        </div>
      </div>
    </div>
  );
}
