import { useState } from "react";
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
import UsAirCarrierPart121_135Card from "./us/UsAirCarrierPart121_135Card";
import UsCapabilityListTable from "./us/UsCapabilityListTable";
import UsCertificateCard from "./us/UsCertificateCard";
import UsClassRatingsGrid from "./us/UsClassRatingsGrid";
import UsLimitedRatingsTable from "./us/UsLimitedRatingsTable";
import UsOpSpecsChecklist from "./us/UsOpSpecsChecklist";
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
          <UsClassRatingsGrid companyId={companyId} />
          <UsLimitedRatingsTable companyId={companyId} authority="faa" />
          <UsCapabilityListTable companyId={companyId} />
          <UsOpSpecsChecklist companyId={companyId} />
          <UsAirCarrierPart121_135Card companyId={companyId} profile={profile} />
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
