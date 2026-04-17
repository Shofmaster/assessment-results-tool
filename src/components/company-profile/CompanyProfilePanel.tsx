import { useMemo, useState } from "react";
import type { FaaCertPart } from "../../config/regulatoryTaxonomy";
import { FAA_CERT_PARTS } from "../../config/regulatoryTaxonomy";
import { useEntityProfileByCompany } from "../../hooks/useConvexData";
import GeneralOrganizationCard from "./GeneralOrganizationCard";
import EasaCapabilityList from "./easa/EasaCapabilityList";
import EasaCertificateCard from "./easa/EasaCertificateCard";
import EasaFormFourPostHolders from "./easa/EasaFormFourPostHolders";
import EasaOtherApprovals from "./easa/EasaOtherApprovals";
import EasaScopeMatrix from "./easa/EasaScopeMatrix";
import IsbaoAndIcaoCard from "./other/IsbaoAndIcaoCard";
import QualityStandardsCard from "./other/QualityStandardsCard";
import TradeComplianceCard from "./other/TradeComplianceCard";
import UsCapabilityListTable from "./us/UsCapabilityListTable";
import UsCertificateCard from "./us/UsCertificateCard";
import UsCertificatesHeldCard from "./us/UsCertificatesHeldCard";
import UsClassRatingsGrid from "./us/UsClassRatingsGrid";
import UsFaaAuthChecklist from "./us/UsFaaAuthChecklist";
import UsLimitedRatingsTable from "./us/UsLimitedRatingsTable";
import UsPart65Authorizations from "./us/UsPart65Authorizations";

type AuthorityTab = "us" | "easa" | "other";

type Props = {
  companyId: string;
  /** Reserved for future platform vs tenant styling */
  mode?: "platform" | "tenant";
};

const tabBtn = (active: boolean) =>
  `px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
    active
      ? "border-sky-light/40 bg-sky/20 text-sky-lighter"
      : "border-white/15 text-white/65 hover:bg-white/5"
  }`;

export default function CompanyProfilePanel({ companyId }: Props) {
  const [tab, setTab] = useState<AuthorityTab>("us");
  const profile = useEntityProfileByCompany(companyId) as Record<string, unknown> | null | undefined;

  /**
   * Which FAA certificate types this company holds. Derived from the explicit
   * `faaCertTypesHeld` column when present; falls back to legacy cert-number
   * columns (145/121/135) for profiles that predate the multi-cert UI.
   */
  const certTypesHeld = useMemo<FaaCertPart[]>(() => {
    const p = (profile ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(p.faaCertTypesHeld) ? (p.faaCertTypesHeld as string[]) : [];
    const valid = raw.filter((x): x is FaaCertPart => (FAA_CERT_PARTS as string[]).includes(x));
    if (valid.length > 0) return valid;
    const inferred: FaaCertPart[] = [];
    if (typeof p.faaCertificateNumber === "string" && p.faaCertificateNumber.trim()) inferred.push("145");
    if (typeof p.faaPart121Certificate === "string" && p.faaPart121Certificate.trim()) inferred.push("121");
    if (typeof p.faaPart135Certificate === "string" && p.faaPart135Certificate.trim()) inferred.push("135");
    return inferred;
  }, [profile]);

  return (
    <div className="mt-4 space-y-4">
      <GeneralOrganizationCard companyId={companyId} profile={profile} />

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        <button type="button" className={tabBtn(tab === "us")} onClick={() => setTab("us")}>
          US — FAA
        </button>
        <button type="button" className={tabBtn(tab === "easa")} onClick={() => setTab("easa")}>
          EASA
        </button>
        <button type="button" className={tabBtn(tab === "other")} onClick={() => setTab("other")}>
          Other / International
        </button>
      </div>

      {tab === "us" ? (
        <div className="space-y-4">
          <UsCertificateCard companyId={companyId} profile={profile} />
          <UsCertificatesHeldCard companyId={companyId} profile={profile} />
          <UsClassRatingsGrid companyId={companyId} />
          <UsLimitedRatingsTable companyId={companyId} authority="faa" />
          <UsCapabilityListTable companyId={companyId} />
          {certTypesHeld.map((cp) => (
            <UsFaaAuthChecklist key={cp} companyId={companyId} certPart={cp} />
          ))}
          <UsPart65Authorizations companyId={companyId} profile={profile} />
        </div>
      ) : null}

      {tab === "easa" ? (
        <div className="space-y-4">
          <EasaCertificateCard companyId={companyId} profile={profile} />
          <EasaScopeMatrix companyId={companyId} />
          <EasaCapabilityList companyId={companyId} />
          <UsLimitedRatingsTable companyId={companyId} authority="easa" />
          <EasaFormFourPostHolders companyId={companyId} profile={profile} />
          <EasaOtherApprovals companyId={companyId} profile={profile} />
        </div>
      ) : null}

      {tab === "other" ? (
        <div className="space-y-4">
          <QualityStandardsCard companyId={companyId} profile={profile} />
          <TradeComplianceCard companyId={companyId} profile={profile} />
          <IsbaoAndIcaoCard companyId={companyId} profile={profile} />
        </div>
      ) : null}
    </div>
  );
}
