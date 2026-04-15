/**
 * RegulatoryProfileEditor — full editor for FAA Part 145 regulatory profile data.
 * Includes: certificate info, class ratings, OpSpecs, limited ratings, capability list,
 * and a live DCT applicability preview.
 *
 * Used in both tenant (company-scoped) and project-scoped contexts.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useRegulatoryProfileByCompany, useRegulatoryProfileByProject } from "../hooks/useRegulatoryProfile";
import { useDctToolDocuments } from "../hooks/useConvexData";
import ClassRatingsGrid from "./ClassRatingsGrid";
import OpSpecsChecklist from "./OpSpecsChecklist";
import LimitedRatingsPanel from "./LimitedRatingsPanel";
import CapabilityListTable from "./CapabilityListTable";
import ApplicabilityPreview from "./ApplicabilityPreview";

type TabId = "cert" | "ratings" | "opspecs" | "limited" | "caplist" | "preview";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "cert",    label: "Certificate",      icon: "🪪" },
  { id: "ratings", label: "Class Ratings",    icon: "⭐" },
  { id: "opspecs", label: "OpSpecs",          icon: "📋" },
  { id: "limited", label: "Limited Ratings",  icon: "🔧" },
  { id: "caplist", label: "Capability List",  icon: "📄" },
  { id: "preview", label: "DCT Preview",      icon: "🎯" },
];

interface BaseProps {
  projectId?: string;
  companyId?: string;
  /** If true, the editor is rendered inside a parent that already handles layout. */
  embedded?: boolean;
}

export default function RegulatoryProfileEditor({ projectId, companyId, embedded = false }: BaseProps) {
  const [activeTab, setActiveTab] = useState<TabId>("cert");

  const profileByCompany = useRegulatoryProfileByCompany(companyId);
  const profileByProject = useRegulatoryProfileByProject(companyId ? undefined : projectId);
  const profileResult = companyId ? profileByCompany : profileByProject;

  const {
    profile,
    entityProfileDoc,
    classRatingDocs,
    opSpecDocs,
    limitedRatingDocs,
    isLoading,
    hasProfile,
    isProfileComplete,
  } = profileResult;

  // DCT docs for the preview (project-scoped only; company scope doesn't have a single project)
  const dctDocs = useDctToolDocuments(projectId) as any[] | undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-white/40 text-sm">
        Loading regulatory profile…
      </div>
    );
  }

  if (!hasProfile && !entityProfileDoc) {
    return (
      <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-300">
        No entity profile found. Create an entity profile first in the General section, then return here to add regulatory data.
      </div>
    );
  }

  const entityProfileId = entityProfileDoc?._id as string;
  const commonProps = { entityProfileId, projectId, companyId };

  const wrapper = embedded ? "" : "rounded-xl border border-white/10 bg-white/3 overflow-hidden";

  return (
    <div className={wrapper}>
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-white/10 bg-white/2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          // Badge counts
          let badge = 0;
          if (tab.id === "ratings") badge = classRatingDocs.length;
          if (tab.id === "opspecs") badge = opSpecDocs.filter((s: any) => s.isActive).length;
          if (tab.id === "limited") badge = limitedRatingDocs.length;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? "border-sky-400 text-sky-300 bg-sky/5"
                  : "border-transparent text-white/50 hover:text-white/75 hover:bg-white/3"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-sky/25 text-sky-200" : "bg-white/10 text-white/40"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === "cert" && (
          <CertificateInfoTab entityProfileDoc={entityProfileDoc} {...commonProps} />
        )}

        {activeTab === "ratings" && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">Class Ratings — 14 CFR §145.59</h3>
              <p className="text-xs text-white/45 mt-0.5">
                Check each class rating your station holds. These are the primary drivers of DCT scoping.
              </p>
            </div>
            <ClassRatingsGrid ratings={classRatingDocs as any} {...commonProps} />
          </div>
        )}

        {activeTab === "opspecs" && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">Operations Specifications</h3>
              <p className="text-xs text-white/45 mt-0.5">
                Check each OpSpec paragraph your station has accepted. D100, A449, and A050 directly affect DCT scoping.
              </p>
            </div>
            <OpSpecsChecklist opSpecs={opSpecDocs as any} {...commonProps} />
          </div>
        )}

        {activeTab === "limited" && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">Limited Ratings — 14 CFR §145.61</h3>
              <p className="text-xs text-white/45 mt-0.5">
                Limited ratings are specific to a make/model. Each requires corresponding Capability List entries.
              </p>
            </div>
            <LimitedRatingsPanel ratings={limitedRatingDocs as any} {...commonProps} />
          </div>
        )}

        {activeTab === "caplist" && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">Capability List — 14 CFR §145.215</h3>
              <p className="text-xs text-white/45 mt-0.5">
                Required when the station holds limited ratings. Lists specific articles, makes/models, and authorized maintenance functions.
              </p>
            </div>
            <CapabilityListTableWrapper {...commonProps} />
          </div>
        )}

        {activeTab === "preview" && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">DCT Applicability Preview</h3>
              <p className="text-xs text-white/45 mt-0.5">
                Live preview of which DCTs apply based on your current regulatory profile. Enable the filter in the DCT Compliance module to use this.
              </p>
            </div>
            <ApplicabilityPreview
              profile={profile}
              dctDocs={dctDocs ?? []}
              isProfileComplete={isProfileComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Certificate Info Tab ───────────────────────────────────────────────────────

function CertificateInfoTab({
  entityProfileDoc,
  entityProfileId,
  projectId,
  companyId,
}: {
  entityProfileDoc: any;
  entityProfileId: string;
  projectId?: string;
  companyId?: string;
}) {
  const [form, setForm] = useState({
    certificateNumber: entityProfileDoc?.certificateNumber ?? "",
    certificateDate: entityProfileDoc?.certificateDate ?? "",
    lastAmendmentDate: entityProfileDoc?.lastAmendmentDate ?? "",
    chdo: entityProfileDoc?.chdo ?? "",
    peerGroup: entityProfileDoc?.peerGroup ?? "F",
  });
  const [saving, setSaving] = useState(false);

  // We need to use the upsert mutation. Import dynamically to avoid circular.
  const { useUpsertEntityProfileByCompany, useUpsertEntityProfile } = require("../hooks/useConvexData");
  const upsertByCompany = useUpsertEntityProfileByCompany();
  const upsertByProject = useUpsertEntityProfile();

  async function handleSave() {
    setSaving(true);
    try {
      if (companyId) {
        await upsertByCompany({
          companyId: companyId as any,
          certificateNumber: form.certificateNumber.trim() || undefined,
          certificateDate: form.certificateDate || undefined,
          lastAmendmentDate: form.lastAmendmentDate || undefined,
          chdo: form.chdo.trim() || undefined,
          peerGroup: form.peerGroup as any,
        });
      } else if (projectId) {
        await upsertByProject({
          projectId: projectId as any,
          certificateNumber: form.certificateNumber.trim() || undefined,
          certificateDate: form.certificateDate || undefined,
          lastAmendmentDate: form.lastAmendmentDate || undefined,
          chdo: form.chdo.trim() || undefined,
          peerGroup: form.peerGroup as any,
        });
      }
      toast.success("Certificate info saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sky-400/40 w-full";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-white/45 mb-1">Certificate number</label>
          <input
            value={form.certificateNumber}
            onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))}
            placeholder="e.g. AZYZ145A"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-white/45 mb-1">Certificate Holding District Office (CHDO)</label>
          <input
            value={form.chdo}
            onChange={(e) => setForm((f) => ({ ...f, chdo: e.target.value }))}
            placeholder="e.g. FSDO-04 Phoenix"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-white/45 mb-1">Initial certification date</label>
          <input
            type="date"
            value={form.certificateDate}
            onChange={(e) => setForm((f) => ({ ...f, certificateDate: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-white/45 mb-1">Last amendment date</label>
          <input
            type="date"
            value={form.lastAmendmentDate}
            onChange={(e) => setForm((f) => ({ ...f, lastAmendmentDate: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-white/45 mb-1">SAS Peer Group</label>
          <select
            value={form.peerGroup}
            onChange={(e) => setForm((f) => ({ ...f, peerGroup: e.target.value }))}
            className={inputCls}
          >
            <option value="F" className="bg-slate-800">Peer Group F — Domestic (within the US)</option>
            <option value="G" className="bg-slate-800">Peer Group G — International, no BASA</option>
            <option value="H" className="bg-slate-800">Peer Group H — International, BASA/MIP</option>
          </select>
          <p className="text-xs text-white/35 mt-1">
            F = stations within the US. G/H = stations outside the US. Determines which DCT question variants apply.
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-sky/20 border border-sky-400/30 text-sky-300 text-sm hover:bg-sky/30 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save certificate info"}
      </button>
    </div>
  );
}

// ── Capability List Wrapper (needs entityProfileId from parent scope) ──────────

function CapabilityListTableWrapper({
  entityProfileId,
  projectId,
  companyId,
}: {
  entityProfileId: string;
  projectId?: string;
  companyId?: string;
}) {
  const { useEntityCapabilityListByProfile } = require("../hooks/useConvexData");
  const items = useEntityCapabilityListByProfile(entityProfileId) as any[] | undefined;

  if (items === undefined) {
    return <div className="text-sm text-white/40 py-4 text-center">Loading…</div>;
  }

  return (
    <CapabilityListTable
      entityProfileId={entityProfileId}
      projectId={projectId}
      companyId={companyId}
      items={items}
    />
  );
}
