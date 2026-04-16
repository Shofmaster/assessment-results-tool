import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EASA_FORM4_ROLES } from "../../../config/regulatoryTaxonomy";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/35 w-full";

type Holder = { roleId: string; name: string; email?: string };

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function EasaFormFourPostHolders({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [holders, setHolders] = useState<Holder[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raw = (profile as any)?.easaForm4PostHolders;
    if (!Array.isArray(raw)) {
      setHolders(EASA_FORM4_ROLES.map((r) => ({ roleId: r.id, name: "", email: "" })));
      return;
    }
    const byRole = new Map<string, Holder>();
    for (const h of raw) {
      if (h && typeof h.roleId === "string" && typeof h.name === "string") {
        byRole.set(h.roleId, { roleId: h.roleId, name: h.name, email: typeof h.email === "string" ? h.email : "" });
      }
    }
    setHolders(
      EASA_FORM4_ROLES.map((r) => byRole.get(r.id) ?? { roleId: r.id, name: "", email: "" }),
    );
  }, [profile?._id, (profile as any)?.updatedAt]);

  function updateName(roleId: string, name: string) {
    setHolders((list) => list.map((h) => (h.roleId === roleId ? { ...h, name } : h)));
  }
  function updateEmail(roleId: string, email: string) {
    setHolders((list) => list.map((h) => (h.roleId === roleId ? { ...h, email } : h)));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = holders
        .filter((h) => h.name.trim())
        .map((h) => ({
          roleId: h.roleId,
          name: h.name.trim(),
          email: h.email?.trim() || undefined,
        }));
      await upsert({
        companyId: companyId as any,
        easaForm4PostHolders: payload.length ? payload : undefined,
      } as any);
      toast.success("Form 4 post-holders saved");
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
          <h4 className="text-sm font-semibold text-amber-100">Form 4 — nominated post-holders</h4>
          <p className="text-[10px] text-amber-100/60 mt-0.5">Accountable Manager, maintenance, quality / compliance monitoring.</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="px-2 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-xs text-amber-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="space-y-2">
        {EASA_FORM4_ROLES.map((role) => {
          const h = holders.find((x) => x.roleId === role.id) ?? { roleId: role.id, name: "", email: "" };
          return (
            <div key={role.id} className="grid gap-2 sm:grid-cols-3 rounded border border-white/10 bg-black/20 p-2">
              <span className="text-[11px] text-amber-100/90 sm:col-span-3 font-medium">{role.label}</span>
              <input
                className={inputCls + " sm:col-span-2"}
                placeholder="Name"
                value={h.name}
                onChange={(e) => updateName(role.id, e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Email (optional)"
                value={h.email ?? ""}
                onChange={(e) => updateEmail(role.id, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
