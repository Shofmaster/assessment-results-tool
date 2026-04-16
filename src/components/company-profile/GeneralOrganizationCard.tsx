import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUpsertEntityProfileByCompany } from "../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 w-full";

type Props = {
  companyId: string;
  profile: Record<string, unknown> | null | undefined;
};

export default function GeneralOrganizationCard({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [form, setForm] = useState({
    companyName: "",
    legalEntityName: "",
    primaryLocation: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    repairStationType: "",
    facilitySquareFootage: "",
    employeeCount: "",
    operationsScope: "",
    smsMaturity: "",
    hasSms: false as boolean | undefined,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setForm({
      companyName: p.companyName ?? "",
      legalEntityName: p.legalEntityName ?? "",
      primaryLocation: p.primaryLocation ?? "",
      contactName: p.contactName ?? "",
      contactEmail: p.contactEmail ?? "",
      contactPhone: p.contactPhone ?? "",
      repairStationType: p.repairStationType ?? "",
      facilitySquareFootage: p.facilitySquareFootage != null ? String(p.facilitySquareFootage) : "",
      employeeCount: p.employeeCount != null ? String(p.employeeCount) : "",
      operationsScope: p.operationsScope ?? "",
      smsMaturity: p.smsMaturity ?? "",
      hasSms: typeof p.hasSms === "boolean" ? p.hasSms : undefined,
    });
  }, [profile?._id, (profile as any)?.updatedAt]);

  async function handleSave() {
    setSaving(true);
    try {
      await upsert({
        companyId: companyId as any,
        companyName: form.companyName.trim() || undefined,
        legalEntityName: form.legalEntityName.trim() || undefined,
        primaryLocation: form.primaryLocation.trim() || undefined,
        contactName: form.contactName.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        repairStationType: form.repairStationType.trim() || undefined,
        facilitySquareFootage: form.facilitySquareFootage ? Number(form.facilitySquareFootage) : undefined,
        employeeCount: form.employeeCount ? Number(form.employeeCount) : undefined,
        operationsScope: form.operationsScope.trim() || undefined,
        smsMaturity: form.smsMaturity.trim() || undefined,
        hasSms: form.hasSms,
      } as any);
      toast.success("Organization details saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">Organization</h3>
          <p className="text-xs text-white/55 mt-0.5 max-w-2xl">
            Legal identity, contacts, and high-level scope. Structured FAA/EASA data lives in the authority tabs below.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="px-3 py-2 rounded-lg bg-sky/20 text-sky-lighter border border-sky-light/30 text-sm shrink-0 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save organization"}
        </button>
      </div>
      {form.repairStationType ? (
        <p className="text-[10px] text-amber-200/80 border border-amber-400/20 rounded-lg px-2 py-1 bg-amber-500/10">
          Legacy free-text &quot;Repair station / org type&quot; is preserved. Prefer describing ratings under US → Class
          ratings.
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input
          className={inputCls}
          placeholder="Company / DBA name"
          value={form.companyName}
          onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Legal entity name"
          value={form.legalEntityName}
          onChange={(e) => setForm((s) => ({ ...s, legalEntityName: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Primary location"
          value={form.primaryLocation}
          onChange={(e) => setForm((s) => ({ ...s, primaryLocation: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Contact name"
          value={form.contactName}
          onChange={(e) => setForm((s) => ({ ...s, contactName: e.target.value }))}
        />
        <input
          type="email"
          className={inputCls}
          placeholder="Contact email"
          value={form.contactEmail}
          onChange={(e) => setForm((s) => ({ ...s, contactEmail: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Contact phone"
          value={form.contactPhone}
          onChange={(e) => setForm((s) => ({ ...s, contactPhone: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Repair station / org type (legacy)"
          value={form.repairStationType}
          onChange={(e) => setForm((s) => ({ ...s, repairStationType: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Facility sq ft"
          value={form.facilitySquareFootage}
          onChange={(e) => setForm((s) => ({ ...s, facilitySquareFootage: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Employee count"
          value={form.employeeCount}
          onChange={(e) => setForm((s) => ({ ...s, employeeCount: e.target.value }))}
        />
        <input
          className={`${inputCls} sm:col-span-2`}
          placeholder="Operations scope (narrative)"
          value={form.operationsScope}
          onChange={(e) => setForm((s) => ({ ...s, operationsScope: e.target.value }))}
        />
        <label className="flex items-center gap-2 text-xs text-white/80 sm:col-span-1">
          <input
            type="checkbox"
            checked={form.hasSms === true}
            onChange={(e) => setForm((s) => ({ ...s, hasSms: e.target.checked }))}
          />
          SMS program
        </label>
        <input
          className={inputCls}
          placeholder="SMS maturity"
          value={form.smsMaturity}
          onChange={(e) => setForm((s) => ({ ...s, smsMaturity: e.target.value }))}
        />
      </div>
    </div>
  );
}
