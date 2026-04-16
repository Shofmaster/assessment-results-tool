import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 w-full";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function EasaCertificateCard({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [form, setForm] = useState({
    easaApprovalRef: "",
    easaCompetentAuthority: "",
    easaPart145Expiry: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setForm({
      easaApprovalRef: p.easaApprovalRef ?? "",
      easaCompetentAuthority: p.easaCompetentAuthority ?? "",
      easaPart145Expiry: p.easaPart145Expiry ?? "",
    });
  }, [profile?._id, (profile as any)?.updatedAt]);

  async function handleSave() {
    setSaving(true);
    try {
      await upsert({
        companyId: companyId as any,
        easaApprovalRef: form.easaApprovalRef.trim() || undefined,
        easaCompetentAuthority: form.easaCompetentAuthority.trim() || undefined,
        easaPart145Expiry: form.easaPart145Expiry || undefined,
      } as any);
      toast.success("EASA Form 3 fields saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-400/15 bg-amber-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-amber-100">EASA Part-145 — Form 3</h4>
          <p className="text-[10px] text-amber-100/60 mt-0.5">Approval reference and competent authority (Reg. 1321/2014).</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="px-2 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-xs text-amber-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputCls}
          placeholder="Approval reference no."
          value={form.easaApprovalRef}
          onChange={(e) => setForm((s) => ({ ...s, easaApprovalRef: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Competent authority / Member State"
          value={form.easaCompetentAuthority}
          onChange={(e) => setForm((s) => ({ ...s, easaCompetentAuthority: e.target.value }))}
        />
        <div className="sm:col-span-2">
          <label className="block text-[10px] text-white/45 mb-1">Part-145 approval expiry (if applicable)</label>
          <input
            type="date"
            className={inputCls}
            value={form.easaPart145Expiry}
            onChange={(e) => setForm((s) => ({ ...s, easaPart145Expiry: e.target.value }))}
          />
        </div>
      </div>
    </div>
  );
}
