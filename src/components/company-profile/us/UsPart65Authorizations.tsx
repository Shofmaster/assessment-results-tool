import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FAA_AIRMAN_CERTS } from "../../../config/regulatoryTaxonomy";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function UsPart65Authorizations({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = (profile as any)?.part65Authorizations;
    setSelected(Array.isArray(p) ? p.filter((x: unknown): x is string => typeof x === "string") : []);
  }, [profile?._id, (profile as any)?.updatedAt, (profile as any)?.part65Authorizations]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save() {
    setSaving(true);
    try {
      await upsert({
        companyId: companyId as any,
        part65Authorizations: selected.length ? selected : undefined,
      } as any);
      toast.success("Part 65 selections saved");
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
          <h4 className="text-sm font-semibold text-white">Part 65 — airman certificates (roster context)</h4>
          <p className="text-[10px] text-white/50 mt-0.5">Tags for which cert types your organization routinely uses.</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="px-2 py-1.5 rounded-lg bg-sky/20 border border-sky-light/30 text-xs text-sky-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {FAA_AIRMAN_CERTS.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/75 cursor-pointer"
          >
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}
