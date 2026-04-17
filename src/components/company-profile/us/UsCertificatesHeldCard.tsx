import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { FaaCertPart } from "../../../config/regulatoryTaxonomy";
import { FAA_CERT_PARTS, FAA_CERT_PART_SHORT_LABEL } from "../../../config/regulatoryTaxonomy";
import { useUpsertEntityProfileByCompany } from "../../../hooks/useConvexData";

const inputCls =
  "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder-white/40 w-full";

type Props = { companyId: string; profile: Record<string, unknown> | null | undefined };

/** Mapping of FaaCertPart -> the entityProfile column that stores its cert number. */
const CERT_NUMBER_FIELD: Record<FaaCertPart, string> = {
  "145": "faaCertificateNumber",
  "121": "faaPart121Certificate",
  "125": "faaPart125Certificate",
  "129": "faaPart129Certificate",
  "133": "faaPart133Certificate",
  "135": "faaPart135Certificate",
  "137": "faaPart137Certificate",
  "141": "faaPart141Certificate",
  "142": "faaPart142Certificate",
  "147": "faaPart147Certificate",
  "91K": "faaPart91KCertificate",
  "91LOA": "", // LOAs don't have a single certificate number
};

/**
 * Lets the user declare which FAA certificate types the company holds.
 * Drives the set of per-paragraph OpSpec/MSpec/TSpec/LOA checklists shown
 * below in the US — FAA tab. Also collects the certificate number for each
 * held certificate (except Part 91 LOAs).
 */
export default function UsCertificatesHeldCard({ companyId, profile }: Props) {
  const upsert = useUpsertEntityProfileByCompany();
  const [held, setHeld] = useState<FaaCertPart[]>([]);
  const [certNumbers, setCertNumbers] = useState<Record<FaaCertPart, string>>(() =>
    Object.fromEntries(FAA_CERT_PARTS.map((cp) => [cp, ""])) as Record<FaaCertPart, string>,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const p = profile as Record<string, unknown>;
    const rawHeld = Array.isArray(p.faaCertTypesHeld) ? (p.faaCertTypesHeld as string[]) : [];
    const validHeld = rawHeld.filter((x): x is FaaCertPart => (FAA_CERT_PARTS as string[]).includes(x));
    // Auto-include legacy certs when their numeric field is populated and the
    // explicit held-list hasn't been saved yet.
    if (validHeld.length === 0) {
      const inferred: FaaCertPart[] = [];
      if (typeof p.faaCertificateNumber === "string" && p.faaCertificateNumber.trim()) inferred.push("145");
      if (typeof p.faaPart121Certificate === "string" && p.faaPart121Certificate.trim()) inferred.push("121");
      if (typeof p.faaPart135Certificate === "string" && p.faaPart135Certificate.trim()) inferred.push("135");
      setHeld(inferred);
    } else {
      setHeld(validHeld);
    }
    const next: Record<FaaCertPart, string> = Object.fromEntries(
      FAA_CERT_PARTS.map((cp) => {
        const field = CERT_NUMBER_FIELD[cp];
        const value = field ? (typeof p[field] === "string" ? (p[field] as string) : "") : "";
        return [cp, value];
      }),
    ) as Record<FaaCertPart, string>;
    setCertNumbers(next);
  }, [profile?._id, (profile as any)?.updatedAt]);

  const toggle = (cp: FaaCertPart) => {
    setHeld((cur) => (cur.includes(cp) ? cur.filter((x) => x !== cp) : [...cur, cp]));
  };

  const saveDisabled = useMemo(() => saving, [saving]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        companyId: companyId as any,
        faaCertTypesHeld: held,
      };
      for (const cp of FAA_CERT_PARTS) {
        const field = CERT_NUMBER_FIELD[cp];
        if (!field) continue;
        const value = certNumbers[cp]?.trim();
        payload[field] = value ? value : undefined;
      }
      await upsert(payload as any);
      toast.success("FAA certificate holdings saved");
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
          <h4 className="text-sm font-semibold text-white">FAA certificates held</h4>
          <p className="text-[10px] text-white/50 mt-0.5">
            Select the certificate types this company holds; the matching OpSpec / MSpec / TSpec / LOA checklists will appear below.
          </p>
        </div>
        <button
          type="button"
          disabled={saveDisabled}
          onClick={() => void handleSave()}
          className="px-2 py-1.5 rounded-lg bg-sky/20 border border-sky-light/30 text-xs text-sky-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {FAA_CERT_PARTS.map((cp) => {
          const checked = held.includes(cp);
          const field = CERT_NUMBER_FIELD[cp];
          return (
            <div
              key={cp}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 space-y-2"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => toggle(cp)} />
                <span className="text-xs font-medium text-white/90">
                  {FAA_CERT_PART_SHORT_LABEL[cp]}
                </span>
              </label>
              {checked && field ? (
                <input
                  className={inputCls}
                  placeholder="Certificate #"
                  value={certNumbers[cp] ?? ""}
                  onChange={(e) =>
                    setCertNumbers((s) => ({ ...s, [cp]: e.target.value }))
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
