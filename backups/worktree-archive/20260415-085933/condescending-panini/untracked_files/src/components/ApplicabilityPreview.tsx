/**
 * ApplicabilityPreview — live summary of DCT applicability based on current regulatory profile.
 * Shown inside RegulatoryProfileEditor to give immediate feedback as the user adds ratings/OpSpecs.
 */

import { useMemo } from "react";
import { computeApplicability, summarizeApplicability } from "../services/dctApplicabilityEngine";
import type { RegulatoryProfile } from "../services/dctApplicabilityEngine";

interface Props {
  profile: RegulatoryProfile | undefined;
  /** The dctToolDocuments loaded for this project/company. */
  dctDocs: Array<{
    _id: string;
    peerGroupLabel?: string;
    specialtyLabel?: string;
    mlfLabel?: string;
    assessmentTypeLabel?: string;
    title?: string;
  }>;
  isProfileComplete: boolean;
}

const PEER_GROUP_LABELS: Record<string, string> = {
  F: "Domestic (US)",
  G: "International — No BASA",
  H: "International — BASA/MIP",
};

export default function ApplicabilityPreview({ profile, dctDocs, isProfileComplete }: Props) {
  const summary = useMemo(() => {
    if (!profile || dctDocs.length === 0) return null;
    const results = computeApplicability(profile, dctDocs);
    return summarizeApplicability(results, profile.peerGroup ?? "F");
  }, [profile, dctDocs]);

  if (!profile) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/3 p-4 text-sm text-white/40 text-center">
        No entity profile found. Create a profile to see applicability preview.
      </div>
    );
  }

  if (dctDocs.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/3 p-4 text-sm text-white/40 text-center">
        No DCT documents loaded for this project yet. Upload DCT XML files in the DCT Compliance module to see applicability.
      </div>
    );
  }

  if (!isProfileComplete) {
    return (
      <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-400 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-300">Profile incomplete</p>
            <p className="text-xs text-white/50 mt-1">
              Add at least one class rating or OpSpec paragraph to enable structured DCT applicability filtering.
              Until then, all {dctDocs.length} DCTs are shown.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const peerLabel = PEER_GROUP_LABELS[profile.peerGroup ?? "F"] ?? profile.peerGroup;
  const heldCategories = [...new Set(profile.classRatings.map((r) => r.category))];
  const activeOpSpecs = profile.opSpecs.filter((s) => s.isActive).map((s) => s.paragraph);

  return (
    <div className="rounded-lg border border-sky-400/20 bg-sky/5 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-semibold text-sky-300">Applicability Preview</h4>
        <span className="text-xs px-2 py-0.5 rounded-full bg-sky/15 border border-sky-400/25 text-sky-300">
          Peer Group {profile.peerGroup ?? "F"} — {peerLabel}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-2xl font-bold text-emerald-400">{summary.applicable}</p>
          <p className="text-xs text-white/50 mt-0.5">Applicable</p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{summary.uncertain}</p>
          <p className="text-xs text-white/50 mt-0.5">Uncertain</p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-2xl font-bold text-white/40">{summary.notApplicable}</p>
          <p className="text-xs text-white/50 mt-0.5">Not Applicable</p>
        </div>
      </div>

      {/* Profile summary */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2 text-xs">
          <span className="text-white/40 w-24 shrink-0">Class ratings:</span>
          {heldCategories.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {heldCategories.map((cat) => {
                const classes = profile.classRatings
                  .filter((r) => r.category === cat)
                  .map((r) => r.classNumber)
                  .sort()
                  .join("/");
                return (
                  <span key={cat} className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/20 text-emerald-300 capitalize">
                    {cat} {classes}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="text-white/30">None entered</span>
          )}
        </div>

        <div className="flex items-start gap-2 text-xs">
          <span className="text-white/40 w-24 shrink-0">Active OpSpecs:</span>
          {activeOpSpecs.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {activeOpSpecs.map((para) => (
                <span key={para} className="px-1.5 py-0.5 rounded bg-sky/15 border border-sky-400/20 text-sky-300 font-mono">
                  {para}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-white/30">None entered</span>
          )}
        </div>

        {profile.hasLimitedRatings && (
          <div className="flex items-start gap-2 text-xs">
            <span className="text-white/40 w-24 shrink-0">Limited ratings:</span>
            <span className="text-amber-300">Yes — Capability List required (§145.215)</span>
          </div>
        )}

        {profile.d100Authorized && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/40 w-24 shrink-0">D100:</span>
            <span className="text-sky-300">Authorized — work away from fixed location</span>
          </div>
        )}
      </div>

      <p className="text-xs text-white/35">
        {summary.applicable + summary.uncertain} of {summary.total} DCTs are applicable or potentially applicable based on this profile.
        {summary.notApplicable > 0 ? ` ${summary.notApplicable} will be hidden when the applicability filter is enabled in the DCT module.` : ""}
      </p>
    </div>
  );
}
