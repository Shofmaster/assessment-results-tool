import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FAA_PART121_135_OPSPEC_SERIES } from "../../../config/regulatoryTaxonomy";
import { useOpSpecsByCompany, useUpsertEntityProfileByCompany, useUpsertOpSpec } from "../../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 w-full";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

export default function UsAirCarrierPart121_135Card({ companyId, profile }: Props) {
  const upsertProfile = useUpsertEntityProfileByCompany();
  const opRows = (useOpSpecsByCompany(companyId) as any[]) ?? [];
  const upsertOp = useUpsertOpSpec();
  const [certs, setCerts] = useState({ part121: "", part135: "" });
  const [saving, setSaving] = useState(false);

  const seriesRows = useMemo(() => opRows.filter((r) => String(r.paragraph).startsWith("Series ")), [opRows]);

  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setCerts({
      part121: p.faaPart121Certificate ?? "",
      part135: p.faaPart135Certificate ?? "",
    });
  }, [profile?._id, (profile as any)?.updatedAt]);

  async function saveCerts() {
    setSaving(true);
    try {
      await upsertProfile({
        companyId: companyId as any,
        faaPart121Certificate: certs.part121.trim() || undefined,
        faaPart135Certificate: certs.part135.trim() || undefined,
      } as any);
      toast.success("Air carrier certificate references saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function rowForParagraph(p: string) {
    return seriesRows.find((r) => r.paragraph === p);
  }

  async function toggleSeries(paragraph: string, isActive: boolean) {
    try {
      await upsertOp({ companyId: companyId as any, authority: "faa", paragraph, isActive } as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-white">Part 121 / 135 context</h4>
        <p className="text-[10px] text-white/50 mt-0.5">Certificate references and OpSpec letter-series flags.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputCls}
          placeholder="Part 121 certificate / opspec ref"
          value={certs.part121}
          onChange={(e) => setCerts((s) => ({ ...s, part121: e.target.value }))}
        />
        <input
          className={inputCls}
          placeholder="Part 135 certificate / opspec ref"
          value={certs.part135}
          onChange={(e) => setCerts((s) => ({ ...s, part135: e.target.value }))}
        />
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => void saveCerts()}
        className="px-2 py-1.5 rounded-lg bg-sky/20 border border-sky-light/30 text-xs text-sky-100 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save certificate refs"}
      </button>
      <div className="space-y-2 pt-2 border-t border-white/10">
        <p className="text-[10px] text-white/45">OpSpec series (121/135)</p>
        {FAA_PART121_135_OPSPEC_SERIES.map((spec) => {
          const row = rowForParagraph(spec.paragraph);
          const checked = row ? row.isActive === true : false;
          return (
            <label key={spec.paragraph} className="flex items-center gap-2 text-[11px] text-white/75 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => void toggleSeries(spec.paragraph, e.target.checked)}
              />
              {spec.paragraph}: {spec.title}
            </label>
          );
        })}
      </div>
    </div>
  );
}
