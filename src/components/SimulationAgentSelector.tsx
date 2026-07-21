/**
 * SimulationAgentSelector — "Configure Simulation" card.
 *
 * Renders the full configuration UI (agent picker, FAA/IS-BAO/Public-Use
 * settings, paperwork-review inclusion, data summary, model selector, and
 * Start button).  All state lives in the parent AuditSimulation orchestrator;
 * this component is purely presentational.
 */
import React from 'react';
import {
  FiCheck,
  FiFileText,
  FiImage,
  FiX,
  FiPlay,
} from 'react-icons/fi';
import type { AuditAgent, FAAConfig, FAAPartScope, PublicUseConfig, SimulationDataSummary } from '../types/auditSimulation';
import type { ISBAOStage } from '../services/auditAgents';
import type { RegionId } from '../config/regionConfig';
import { FAA_PARTS, FAA_INSPECTOR_SPECIALTIES } from '../data/faaInspectorTypes';
import { REGIONS } from '../config/regionConfig';
import { PUBLIC_USE_ENTITY_TYPE_LABELS, PUBLIC_USE_AUDIT_FOCUS_LABELS } from '../services/auditAgents';
import type { AttachedImage } from '../services/auditAgents';
import { Button, GlassCard, Select, Badge } from './ui';
import { PageModelSelector } from './PageModelSelector';
import ReadinessChecklist from './readiness/ReadinessChecklist';
import { auditSimGapsToItems } from './readiness/adapters';

export interface SimulationAgentSelectorProps {
  // Agent selection
  availableAgents: AuditAgent[];
  selectedAgents: Set<AuditAgent['id']>;
  onToggleAgent: (id: AuditAgent['id']) => void;
  onSelectAllAgents: () => void;
  onDeselectAllAgents: () => void;

  // FAA Inspector config
  faaConfig: FAAConfig;
  onSetFaaConfig: React.Dispatch<React.SetStateAction<FAAConfig>>;

  // IS-BAO stage
  selectedIsbaoStage: ISBAOStage;
  onSetIsbaoStage: (s: ISBAOStage) => void;

  // Public-use auditor config
  publicUseConfig: PublicUseConfig;
  onSetPublicUseConfig: React.Dispatch<React.SetStateAction<PublicUseConfig>>;

  // Assessment + round count
  assessments: any[];
  selectedAssessment: string;
  onSetAssessment: (id: string) => void;
  totalRounds: number;
  onSetTotalRounds: (n: number) => void;

  // Attached images
  attachedImages: Array<{ name: string } & AttachedImage>;
  imageInputRef: React.RefObject<HTMLInputElement>;
  onImageAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;

  // Paperwork reviews
  completedReviews: any[];
  selectedReviewIds: Set<string>;
  docNameMap: Record<string, string>;
  onToggleReview: (id: string) => void;
  onSelectAllReviews: () => void;
  onDeselectAllReviews: (e?: React.MouseEvent) => void;

  // KB document region filter
  selectedRegion: RegionId;
  onSetRegion: (r: RegionId) => void;

  // Data summary + start
  dataSummary: SimulationDataSummary;
  isRunning: boolean;
  onStart: () => void;
}

export default function SimulationAgentSelector({
  availableAgents,
  selectedAgents,
  onToggleAgent,
  onSelectAllAgents,
  onDeselectAllAgents,
  faaConfig,
  onSetFaaConfig,
  selectedIsbaoStage,
  onSetIsbaoStage,
  publicUseConfig,
  onSetPublicUseConfig,
  assessments,
  selectedAssessment,
  onSetAssessment,
  totalRounds,
  onSetTotalRounds,
  attachedImages,
  imageInputRef,
  onImageAttach,
  onRemoveImage,
  completedReviews,
  selectedReviewIds,
  docNameMap,
  onToggleReview,
  onSelectAllReviews,
  onDeselectAllReviews,
  selectedRegion,
  onSetRegion,
  dataSummary,
  isRunning,
  onStart,
}: SimulationAgentSelectorProps) {
  return (
    <GlassCard className="mb-6 overflow-y-auto scrollbar-thin">
      <h2 className="text-xl font-display font-bold mb-4">Configure Simulation</h2>

      <p className="text-sm text-white/70 mb-2">Click to select or deselect participants</p>
      <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Select or clear all participants">
        <Button type="button" variant="ghost" size="sm" onClick={onSelectAllAgents}>
          Check all
        </Button>
        <span className="text-white/30" aria-hidden>|</span>
        <Button type="button" variant="ghost" size="sm" onClick={onDeselectAllAgents}>
          Uncheck all
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
        {availableAgents.map((agent) => {
          const isSelected = selectedAgents.has(agent.id);
          const isFaa = agent.id === 'faa-inspector';
          const isPU = agent.id === 'public-use-auditor';
          return (
            <div key={agent.id} className="flex flex-col gap-0 min-h-[9rem]">
              <button
                type="button"
                onClick={() => onToggleAgent(agent.id)}
                className={`relative p-3 rounded-xl border text-left transition-all h-full min-h-[9rem] flex flex-col ${
                  isSelected
                    ? 'bg-white/5 border-sky-light/40'
                    : 'bg-white/5 border-white/20 hover:border-sky-light/30 hover:bg-white/[0.07]'
                }`}
              >
                {isSelected ? (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-sky-light rounded-full flex items-center justify-center">
                    <FiCheck className="text-navy-900 text-xs" />
                  </div>
                ) : (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full border-2 border-white/40" aria-hidden />
                )}
                <div className="font-bold text-sm">{agent.name}</div>
                {isFaa && isSelected && faaConfig.partsScope?.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {faaConfig.partsScope.map((p) => (
                      <Badge key={p} size="sm" pill className="text-xs">
                        Part {p}
                      </Badge>
                    ))}
                  </div>
                ) : isPU && isSelected ? (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Badge size="sm" pill className="text-xs">
                      {PUBLIC_USE_AUDIT_FOCUS_LABELS[publicUseConfig.auditFocus].split(' ')[0]}
                    </Badge>
                  </div>
                ) : (
                  <div className="mt-1.5 min-h-[1.5rem]" aria-hidden />
                )}
                <div className="text-xs text-white/60 mt-1 line-clamp-2">{agent.role}</div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Region filter for KB documents */}
      <GlassCard rounded="xl" padding="md" className="mb-6 border border-white/10">
        <h3 className="text-sm font-semibold text-white/90 mb-2">Document Region Filter</h3>
        <p className="text-xs text-white/60 mb-3">
          Only KB documents tagged with the selected region (or "All Regions") will be included in agent prompts.
        </p>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSetRegion(r.id as RegionId)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                selectedRegion === r.id
                  ? 'bg-sky/20 border-sky-light/50 text-sky-lighter'
                  : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30 hover:text-white/80'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {selectedAgents.has('faa-inspector') && (
        <GlassCard rounded="xl" padding="md" className="mb-6 border border-sky/20">
          <h3 className="text-sm font-semibold text-sky-light mb-2">FAA Inspector scope and type</h3>
          <p className="text-xs text-white/70 mb-3">Select at least one Part; then choose specialty and inspection type.</p>
          <div className="flex flex-wrap gap-4 mb-4">
            <span className="text-sm text-white/70">Scope (Parts):</span>
            {FAA_PARTS.map((part) => {
              const checked = faaConfig.partsScope?.includes(part) ?? false;
              return (
                <label key={part} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      onSetFaaConfig((prev) => {
                        const next = prev.partsScope?.includes(part)
                          ? (prev.partsScope.filter((p) => p !== part) as FAAPartScope[])
                          : [...(prev.partsScope || []), part];
                        return { ...prev, partsScope: next };
                      });
                    }}
                    className="rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                  />
                  <span className="text-sm">Part {part}</span>
                </label>
              );
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-white/70 mb-1.5">Specialty</label>
              <Select
                value={faaConfig.specialtyId}
                onChange={(e) => {
                  const specialty = FAA_INSPECTOR_SPECIALTIES.find((s) => s.id === e.target.value);
                  onSetFaaConfig((prev) => ({
                    ...prev,
                    specialtyId: e.target.value,
                    inspectionTypeId: specialty?.inspectionTypes[0]?.id ?? prev.inspectionTypeId,
                  }));
                }}
              >
                {FAA_INSPECTOR_SPECIALTIES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-navy-800">
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs text-white/70 mb-1.5">Inspection type</label>
              <select
                value={faaConfig.inspectionTypeId}
                onChange={(e) => onSetFaaConfig((prev) => ({ ...prev, inspectionTypeId: e.target.value }))}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-sky-light focus:ring-1 focus:ring-sky-light"
              >
                {(FAA_INSPECTOR_SPECIALTIES.find((s) => s.id === faaConfig.specialtyId)?.inspectionTypes ?? []).map(
                  (t) => (
                    <option key={t.id} value={t.id} className="bg-navy-800">
                      {t.name}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
          {(faaConfig.partsScope?.length ?? 0) === 0 && (
            <p className="text-amber-400/90 text-xs mt-2">Select at least one Part (121, 135, and/or 145).</p>
          )}
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Select
          label="Assessment (optional)"
          value={selectedAssessment}
          onChange={(e) => onSetAssessment(e.target.value)}
        >
          <option value="" className="bg-navy-800">No assessment — use generic context</option>
          {assessments.map((a) => (
            <option key={a._id} value={a._id} className="bg-navy-800">
              {a.data.companyName} - {new Date(a.importedAt).toLocaleDateString()}
            </option>
          ))}
        </Select>

        <Select
          label="Audit Rounds"
          value={totalRounds}
          onChange={(e) => onSetTotalRounds(Number(e.target.value))}
        >
          {[3, 5, 6, 8, 10, 12, 15].map((n) => (
            <option key={n} value={n} className="bg-navy-800">
              {n} round{n > 1 ? 's' : ''}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2 mb-4">
        <span className="text-sm font-medium text-white/80">Attach images (optional)</span>
        <p className="text-xs text-white/60">Photos of logs, nameplates, or documents to include in the audit context.</p>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={onImageAttach}
          className="hidden"
          disabled={isRunning}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => imageInputRef.current?.click()}
          disabled={isRunning}
          icon={<FiImage />}
        >
          Choose images
        </Button>
        {attachedImages.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachedImages.map((img, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2 px-3 bg-white/5 rounded-lg text-sm">
                <span className="truncate text-white/80">{img.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveImage(i)}
                  disabled={isRunning}
                  className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  aria-label="Remove image"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedAgents.has('isbao-auditor') && (
        <div className="mb-4">
          <Select
            label="IS-BAO stage (IS-BAO auditor will focus only on this stage)"
            value={String(selectedIsbaoStage)}
            onChange={(e) => onSetIsbaoStage(Number(e.target.value) as ISBAOStage)}
          >
            <option value="1" className="bg-navy-800">Stage 1 — SMS infrastructure & written procedures</option>
            <option value="2" className="bg-navy-800">Stage 2 — Risk management in use</option>
            <option value="3" className="bg-navy-800">Stage 3 — SMS integrated into culture</option>
          </Select>
        </div>
      )}

      {selectedAgents.has('public-use-auditor') && (
        <GlassCard rounded="xl" padding="md" className="mb-6 border border-stone-500/30">
          <h3 className="text-sm font-semibold text-stone-300 mb-2">🏛️ Public Use Aircraft Auditor — skill configuration</h3>
          <p className="text-xs text-white/70 mb-4">
            Configure the government entity type and the specific audit focus area. The auditor will anchor its
            questions and findings to these settings.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-white/70 mb-1.5">Government entity type</label>
              <select
                value={publicUseConfig.entityType}
                onChange={(e) =>
                  onSetPublicUseConfig((prev) => ({
                    ...prev,
                    entityType: e.target.value as PublicUseConfig['entityType'],
                  }))
                }
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
              >
                {(Object.entries(PUBLIC_USE_ENTITY_TYPE_LABELS) as [PublicUseConfig['entityType'], string][]).map(
                  ([val, label]) => (
                    <option key={val} value={val} className="bg-navy-800">
                      {label}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/70 mb-1.5">Audit focus</label>
              <select
                value={publicUseConfig.auditFocus}
                onChange={(e) =>
                  onSetPublicUseConfig((prev) => ({
                    ...prev,
                    auditFocus: e.target.value as PublicUseConfig['auditFocus'],
                  }))
                }
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
              >
                {(Object.entries(PUBLIC_USE_AUDIT_FOCUS_LABELS) as [PublicUseConfig['auditFocus'], string][]).map(
                  ([val, label]) => (
                    <option key={val} value={val} className="bg-navy-800">
                      {label}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
          <p className="text-xs text-white/50 mt-3">
            Key references: 49 U.S.C. §§ 40102 &amp; 40125 · AC 00-1.1A · 49 CFR Part 830 (NTSB reporting)
          </p>
        </GlassCard>
      )}

      {completedReviews.length > 0 && (
        <GlassCard rounded="xl" padding="md" className="mb-6 border border-sky/20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-sky-light flex items-center gap-2">
              <FiFileText className="w-4 h-4" />
              Paperwork Reviews ({completedReviews.length} completed)
            </h3>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectAllReviews();
                }}
              >
                Select all
              </Button>
              <span className="text-white/30" aria-hidden>|</span>
              <Button type="button" variant="ghost" size="sm" onClick={onDeselectAllReviews}>
                Clear
              </Button>
            </div>
          </div>
          <p className="text-xs text-white/70 mb-3">
            Include completed paperwork review findings in the simulation. Agents will reference these when discussing compliance.
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
            {completedReviews.map((review: any) => {
              const isSelected = selectedReviewIds.has(review._id);
              const underReviewName = docNameMap[review.underReviewDocumentId] || 'Document under review';
              const findingCount = Array.isArray(review.findings) ? review.findings.length : 0;
              const criticalCount = Array.isArray(review.findings)
                ? review.findings.filter((f: any) => f.severity === 'critical').length
                : 0;
              return (
                <label
                  key={review._id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-sky/10 border-sky/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/8'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleReview(review._id)}
                    className="mt-0.5 rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate">{underReviewName}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge
                        size="sm"
                        className={
                          review.verdict === 'pass'
                            ? 'bg-green-500/20 text-green-300'
                            : review.verdict === 'conditional'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-red-500/20 text-red-300'
                        }
                      >
                        {review.verdict}
                      </Badge>
                      {findingCount > 0 && (
                        <span className="text-xs text-white/60">
                          {findingCount} finding{findingCount !== 1 ? 's' : ''}
                          {criticalCount > 0 && (
                            <span className="text-red-400 ml-1">({criticalCount} critical)</span>
                          )}
                        </span>
                      )}
                      {review.reviewScope && (
                        <span className="text-xs text-white/50 truncate max-w-[150px]">
                          Scope: {review.reviewScope}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          {selectedReviewIds.size > 0 && (
            <p className="text-xs text-sky-light/80 mt-2">
              {selectedReviewIds.size} review{selectedReviewIds.size !== 1 ? 's' : ''} will be included in the simulation context.
            </p>
          )}
        </GlassCard>
      )}

      <GlassCard rounded="xl" padding="md" className="mb-6 border border-white/10">
        <h3 className="text-sm font-semibold text-sky-light mb-2">Data for this simulation</h3>
        <p className="text-xs text-white/70 mb-2">
          We run on what you have. If something is missing, we continue and you can add it later.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/60">Assessment:</span>
            <span className={dataSummary.hasAssessment ? 'text-white' : 'text-amber-400/90'}>
              {dataSummary.assessmentName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/60">Entity docs:</span>
            <span>{dataSummary.entityDocsWithText}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/60">SMS docs:</span>
            <span>{dataSummary.smsDocsWithText}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/60">Uploaded docs:</span>
            <span>{dataSummary.uploadedDocsWithText}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/60">Paperwork reviews:</span>
            <span className={dataSummary.paperworkReviewsIncluded > 0 ? 'text-sky-light' : 'text-white/40'}>
              {dataSummary.paperworkReviewsIncluded}
            </span>
          </div>
        </div>
        <div className="pt-2 border-t border-white/10">
          <ReadinessChecklist
            compact
            title="Before you run (the simulation still works without these)"
            items={auditSimGapsToItems(dataSummary, {
              selectedAgents,
              agentNames: Object.fromEntries(availableAgents.map((a) => [a.id, a.name])),
              completedReviewsAvailable: completedReviews.length,
            })}
          />
        </div>
      </GlassCard>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <PageModelSelector field="auditSimModel" compact disabled={isRunning} />
        </div>
        <Button
          size="lg"
          onClick={onStart}
          icon={<FiPlay />}
          className="min-w-0 sm:min-w-[180px] shrink-0"
          disabled={selectedAgents.size === 0}
        >
          Start Audit Simulation
        </Button>
      </div>
    </GlassCard>
  );
}
