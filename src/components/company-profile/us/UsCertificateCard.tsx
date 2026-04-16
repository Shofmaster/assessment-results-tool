import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FAA_PEER_GROUPS } from "../../../config/regulatoryTaxonomy";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 w-full";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function UsCertificateCard({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [form, setForm] = useState({
    faaCertificateNumber: "",
    faaChdo: "",
    faaCertificateDate: "",
    faaLastAmendmentDate: "",
    faaPeerGroup: "" as "" | "F" | "G" | "H",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setForm({
      faaCertificateNumber: p.faaCertificateNumber ?? "",
      faaChdo: p.faaChdo ?? "",
      faaCertificateDate: p.faaCertificateDate ?? "",
      faaLastAmendmentDate: p.faaLastAmendmentDate ?? "",
      faaPeerGroup: (p.faaPeerGroup as "F" | "G" | "H") ?? "",
    });
  }, [profile?._id, (profile as any)?.updatedAt]);

  async function handleSave() {
    setSaving(true);
    try {
      await upsert({
        companyId: companyId as any,
        faaCertificateNumber: form.faaCertificateNumber.trim() || undefined,
        faaChdo: form.faaChdo.trim() || undefined,
        faaCertificateDate: form.faaCertificateDate || undefined,
        faaLastAmendmentDate: form.faaLastAmendmentDate || undefined,
        faaPeerGroup: form.faaPeerGroup || undefined,
      } as any);
      toast.success("FAA certificate info saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-white">FAA certificate (Part 145)</h4>
          <p className="text-[10px] text-white/50 mt-0.5">14 CFR Part 145; SAS peer group (8900.1).</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="px-2 py-1.5 rounded-lg bg-sky/20 border border-sky-light/30 text-xs text-sky-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputCls}
          placeholder="Certificate number"
          value={form.faaCertificateNumber}
          onChange={(e) => setForm((s) => ({ ...s, faaCertificateNumber: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="CHDO / FSDO"
          value={form.faaChdo}
          onChange={(e) => setForm((s) => ({ ...s, faaChdo: e.target.value }))}
        />
        <div>
          <label className="block text-[10px] text-white/45 mb-1">Initial certification date</label>
          <input
            type="date"
            className={inputCls}
            value={form.faaCertificateDate}
            onChange={(e) => setForm((s) => ({ ...s, faaCertificateDate: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-[10px] text-white/45 mb-1">Last amendment date</label>
          <input
            type="date"
            className={inputCls}
            value={form.faaLastAmendmentDate}
            onChange={(e) => setForm((s) => ({ ...s, faaLastAmendmentDate: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[10px] text-white/45 mb-1">SAS peer group</label>
          <select
            className={inputCls}
            value={form.faaPeerGroup}
            onChange={(e) => setForm((s) => ({ ...s, faaPeerGroup: e.target.value as any }))}
          >
            <option value="">Not set</option>
            {FAA_PEER_GROUPS.map((g) => (
              <option key={g.id} value={g.id} className="bg-slate-900">
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
