import { useState, useCallback, useEffect, useMemo } from 'react';
import { FiUsers, FiSliders, FiToggleLeft, FiToggleRight, FiCheckCircle } from 'react-icons/fi';
import { toast } from 'sonner';
import { GlassCard } from './ui';
import {
  useUserDirectoryForCompany,
  useAllUserSettingsAdmin,
  useUpdateEnabledAgents,
  useUpdateEnabledFrameworks,
  useUpdateEnabledFeatures,
} from '../hooks/useConvexData';
import { AUDIT_AGENTS } from '../data/auditAgentDefinitions';
import { AUDIT_CHECKLIST_TEMPLATES } from '../config/auditChecklistTemplates';
import { FEATURE_GROUPS, FEATURE_LABELS, ALL_FEATURE_KEYS } from '../config/featureKeys';
import { AGENT_TYPES } from '../config/adminAgentTypes';
import type { AuditAgentCategory } from '../types/auditSimulation';

const ALL_NON_HOST_AGENT_IDS = AUDIT_AGENTS.filter(a => a.id !== 'audit-host').map(a => a.id);
const ALL_FRAMEWORK_IDS = AUDIT_CHECKLIST_TEMPLATES.map(t => t.framework);

const CATEGORY_LABELS: Record<AuditAgentCategory, string> = {
  regulatory: 'Regulatory & Certification',
  entity: 'Entity Operations',
  analysis: 'Analysis & Intelligence',
  'software-hardware': 'Software & Hardware Assurance',
  'special-process': 'Special Processes & Supply Chain',
  'defense-space': 'Defense & Space',
  emerging: 'Emerging Technologies',
};

const FRAMEWORK_CATEGORY_MAP: Record<string, string> = {
  faa: 'Regulatory & Certification',
  easa: 'Regulatory & Certification',
  as9100: 'Regulatory & Certification',
  iosa: 'Regulatory & Certification',
  isbao: 'Entity Operations',
  sms: 'Entity Operations',
  'third-party-safety': 'Entity Operations',
  'public-use': 'Entity Operations',
  'supply-chain': 'Special Processes & Supply Chain',
  nadcap: 'Special Processes & Supply Chain',
  airworthiness: 'Regulatory & Certification',
  defense: 'Defense & Space',
  do178c: 'Software & Hardware Assurance',
  do254: 'Software & Hardware Assurance',
  'systems-safety': 'Software & Hardware Assurance',
  'environmental-test': 'Software & Hardware Assurance',
  space: 'Defense & Space',
  cybersecurity: 'Defense & Space',
  'uas-evtol': 'Emerging Technologies',
  laboratory: 'Special Processes & Supply Chain',
  'additive-mfg': 'Emerging Technologies',
};

interface TogglePreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  agents: string[] | null;
  frameworks: string[] | null;
  features: string[] | null;
}

const TOGGLE_PRESETS: TogglePreset[] = [
  { id: 'full-suite', label: 'Full Suite', emoji: '🌐', description: 'All agents, frameworks, and features enabled — maximum coverage', agents: null, frameworks: null, features: [...ALL_FEATURE_KEYS] },
  { id: 'mro-part145', label: 'MRO / Part 145', emoji: '🔧', description: 'Repair station & maintenance focused — FAA, AS9100, SMS, supply chain', agents: ['faa-inspector', 'as9100-auditor', 'general-manager', 'sms-auditor', 'mro-quality-auditor', 'supply-chain-auditor', 'nadcap-auditor', 'airworthiness-auditor', 'audit-intelligence-analyst'], frameworks: ['faa', 'as9100', 'sms', 'supply-chain', 'nadcap', 'airworthiness'], features: ['audit-simulation', 'checklists', 'library', 'analysis', 'entity-issues', 'guided-audit', 'paperwork-review', 'schedule', 'manual-management'] },
  { id: 'avionics-oem', label: 'Avionics OEM', emoji: '💻', description: 'Avionics/electronics OEM — software, hardware, EASA, DO-254/178C', agents: ['faa-inspector', 'easa-auditor', 'as9100-auditor', 'do178c-auditor', 'do254-auditor', 'systems-safety-auditor', 'do160-auditor', 'supply-chain-auditor', 'airworthiness-auditor', 'cybersecurity-auditor', 'audit-intelligence-analyst'], frameworks: ['faa', 'easa', 'as9100', 'do178c', 'do254', 'systems-safety', 'environmental-test', 'airworthiness', 'cybersecurity'], features: ['audit-simulation', 'checklists', 'library', 'analysis', 'entity-issues', 'guided-audit', 'paperwork-review', 'report-builder', 'analytics', 'manual-writer'] },
  { id: 'defense-contractor', label: 'Defense Contractor', emoji: '🎖️', description: 'DoD aerospace supplier — CMMC, MIL-STD, FAR/DFARS, NADCAP', agents: ['faa-inspector', 'as9100-auditor', 'defense-auditor', 'supply-chain-auditor', 'nadcap-auditor', 'cybersecurity-auditor', 'systems-safety-auditor', 'do160-auditor', 'audit-intelligence-analyst'], frameworks: ['as9100', 'defense', 'nadcap', 'supply-chain', 'cybersecurity', 'environmental-test', 'systems-safety'], features: ['audit-simulation', 'checklists', 'library', 'analysis', 'entity-issues', 'guided-audit', 'report-builder', 'analytics'] },
  { id: 'space-company', label: 'Space Company', emoji: '🚀', description: 'Launch vehicles, satellites, spacecraft — ECSS, NASA-STD, space assurance', agents: ['faa-inspector', 'as9100-auditor', 'space-systems-auditor', 'systems-safety-auditor', 'do178c-auditor', 'do254-auditor', 'supply-chain-auditor', 'additive-mfg-auditor', 'audit-intelligence-analyst'], frameworks: ['as9100', 'space', 'systems-safety', 'do178c', 'do254', 'supply-chain', 'additive-mfg'], features: ['audit-simulation', 'checklists', 'library', 'analysis', 'entity-issues', 'guided-audit', 'report-builder', 'analytics'] },
  { id: 'bizav-isbao', label: 'Business Aviation', emoji: '✈️', description: 'IS-BAO, SMS, Part 91/135 focused — corporate & charter operators', agents: ['faa-inspector', 'general-manager', 'sms-auditor', 'isbao-auditor', 'mro-quality-auditor', 'audit-intelligence-analyst'], frameworks: ['faa', 'isbao', 'sms', 'third-party-safety', 'public-use'], features: ['audit-simulation', 'checklists', 'library', 'analysis', 'entity-issues', 'guided-audit', 'schedule', 'manual-management'] },
  { id: 'airline-iosa', label: 'Airline / IOSA', emoji: '🛫', description: 'Commercial airline — IATA IOSA, FAA, EASA, SMS, Part 121', agents: ['faa-inspector', 'easa-auditor', 'general-manager', 'sms-auditor', 'iosa-auditor', 'mro-quality-auditor', 'airworthiness-auditor', 'audit-intelligence-analyst'], frameworks: ['faa', 'easa', 'iosa', 'sms', 'airworthiness'], features: ['audit-simulation', 'checklists', 'library', 'analysis', 'entity-issues', 'guided-audit', 'paperwork-review', 'revisions', 'schedule'] },
  { id: 'uas-evtol', label: 'UAS / eVTOL', emoji: '🚁', description: 'Unmanned and advanced air mobility — Part 107, SORA, SC-VTOL', agents: ['faa-inspector', 'easa-auditor', 'as9100-auditor', 'uas-evtol-auditor', 'systems-safety-auditor', 'cybersecurity-auditor', 'audit-intelligence-analyst'], frameworks: ['faa', 'easa', 'as9100', 'uas-evtol', 'systems-safety', 'cybersecurity'], features: ['audit-simulation', 'checklists', 'library', 'analysis', 'entity-issues', 'guided-audit', 'paperwork-review', 'analytics', 'report-builder'] },
];

interface Props {
  adminScopeCompanyId: string | undefined;
  initialUserId?: string;
}

export default function AdminTogglesTab({ adminScopeCompanyId, initialUserId }: Props) {
  const allUsers = useUserDirectoryForCompany(adminScopeCompanyId, true) as any[] | undefined;
  const allUserSettings = useAllUserSettingsAdmin() as any[] | undefined;
  const updateEnabledAgents = useUpdateEnabledAgents();
  const updateEnabledFrameworks = useUpdateEnabledFrameworks();
  const updateEnabledFeatures = useUpdateEnabledFeatures();

  const userSettingsByClerkId = useMemo(() => {
    const map = new Map<string, any>();
    for (const setting of (allUserSettings || [])) {
      if (setting?.userId) map.set(setting.userId, setting);
    }
    return map;
  }, [allUserSettings]);

  const [togglesTargetUserId, setTogglesTargetUserId] = useState<string>(initialUserId ?? '');
  const [togglesSaving, setTogglesSaving] = useState(false);
  const [draftAgents, setDraftAgents] = useState<string[] | null>(null);
  const [draftFrameworks, setDraftFrameworks] = useState<string[] | null>(null);
  const [draftFeatures, setDraftFeatures] = useState<string[] | null>(null);
  const [togglesDirty, setTogglesDirty] = useState(false);

  const selectedUserObj = useMemo(
    () => (allUsers || []).find((u: any) => u._id === togglesTargetUserId) ?? null,
    [allUsers, togglesTargetUserId]
  );

  const selectedUserSettings = useMemo(() => {
    if (!selectedUserObj) return null;
    return userSettingsByClerkId.get(selectedUserObj.clerkUserId) ?? null;
  }, [selectedUserObj, userSettingsByClerkId]);

  const currentEnabledAgents: string[] | null = selectedUserSettings?.enabledAgents ?? null;
  const currentEnabledFrameworks: string[] | null = selectedUserSettings?.enabledFrameworks ?? null;
  const currentEnabledFeatures: string[] | null = selectedUserSettings?.enabledFeatures ?? null;

  const initDraft = useCallback((agents: string[] | null, frameworks: string[] | null, features: string[] | null) => {
    setDraftAgents(agents);
    setDraftFrameworks(frameworks);
    setDraftFeatures(features);
    setTogglesDirty(false);
  }, []);

  // When initialUserId prop changes (from users tab Configure button), pre-select that user
  useEffect(() => {
    if (!initialUserId) return;
    setTogglesTargetUserId(initialUserId);
    const user = (allUsers || []).find((u: any) => u._id === initialUserId);
    if (user) {
      const settings = userSettingsByClerkId.get(user.clerkUserId);
      initDraft(settings?.enabledAgents ?? null, settings?.enabledFrameworks ?? null, settings?.enabledFeatures ?? null);
    }
  }, [initialUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectToggleUser = (userId: string) => {
    setTogglesTargetUserId(userId);
    if (!userId) { initDraft(null, null, null); return; }
    const user = (allUsers || []).find((u: any) => u._id === userId);
    if (!user) return;
    const settings = userSettingsByClerkId.get(user.clerkUserId);
    initDraft(settings?.enabledAgents ?? null, settings?.enabledFrameworks ?? null, settings?.enabledFeatures ?? null);
  };

  const effectiveAgents = draftAgents ?? ALL_NON_HOST_AGENT_IDS;
  const effectiveFrameworks = draftFrameworks ?? ALL_FRAMEWORK_IDS;
  const effectiveFeatures = draftFeatures ?? [];

  const toggleAgent = (agentId: string) => {
    const current = draftAgents ?? ALL_NON_HOST_AGENT_IDS;
    setDraftAgents(current.includes(agentId) ? current.filter(id => id !== agentId) : [...current, agentId]);
    setTogglesDirty(true);
  };

  const toggleFramework = (fw: string) => {
    const current = draftFrameworks ?? ALL_FRAMEWORK_IDS;
    setDraftFrameworks(current.includes(fw) ? current.filter(id => id !== fw) : [...current, fw]);
    setTogglesDirty(true);
  };

  const applyPreset = (preset: TogglePreset) => {
    if (preset.id === 'full-suite') {
      setDraftAgents(null);
      setDraftFrameworks(null);
      setDraftFeatures([...ALL_FEATURE_KEYS]);
    } else {
      setDraftAgents(preset.agents);
      setDraftFrameworks(preset.frameworks);
      setDraftFeatures(preset.features);
    }
    setTogglesDirty(true);
  };

  const handleSaveToggles = async () => {
    if (!togglesTargetUserId) return;
    setTogglesSaving(true);
    try {
      await updateEnabledAgents({ targetUserId: togglesTargetUserId as any, enabledAgents: draftAgents } as any);
      await updateEnabledFrameworks({ targetUserId: togglesTargetUserId as any, enabledFrameworks: draftFrameworks } as any);
      await updateEnabledFeatures({ targetUserId: togglesTargetUserId as any, enabledFeatures: draftFeatures } as any);
      toast.success('Feature toggles saved');
      setTogglesDirty(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save toggles');
    } finally {
      setTogglesSaving(false);
    }
  };

  const agentsByCategory = useMemo(() => {
    const groups: Partial<Record<AuditAgentCategory, typeof AGENT_TYPES>> = {};
    for (const a of AGENT_TYPES) {
      if (!groups[a.category]) groups[a.category] = [];
      groups[a.category]!.push(a);
    }
    return groups;
  }, []);

  const frameworksByCategory = useMemo(() => {
    const groups: Record<string, typeof AUDIT_CHECKLIST_TEMPLATES> = {};
    for (const t of AUDIT_CHECKLIST_TEMPLATES) {
      const cat = FRAMEWORK_CATEGORY_MAP[t.framework] ?? 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }
    return groups;
  }, []);

  return (
    <div className="space-y-6">
      <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
        <p className="text-sm text-violet-300/90">
          Configure which <strong>auditor agents</strong>, <strong>checklist frameworks</strong>, and <strong>app features</strong> are active for each user.
          Use presets to quickly configure for a specific company type, or toggle individual items.
          <span className="block mt-1 text-violet-400/70">Null/unset = all enabled (default). Saved settings take effect immediately for that user.</span>
        </p>
      </div>

      <GlassCard border rounded="xl">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
            <FiUsers className="text-violet-400" />
            Select User to Configure
          </h3>
        </div>
        <div className="p-4">
          <select
            value={togglesTargetUserId}
            onChange={(e) => handleSelectToggleUser(e.target.value)}
            className="w-full max-w-sm bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400/50"
          >
            <option value="">— choose a user —</option>
            {(allUsers || []).map((u: any) => (
              <option key={u._id} value={u._id}>{u.name || u.email} ({u.email})</option>
            ))}
          </select>
          {selectedUserObj && (
            <p className="mt-2 text-xs text-white/50">
              Saved: {currentEnabledAgents === null ? 'All agents' : `${currentEnabledAgents.length} agents`}
              {' · '}{currentEnabledFrameworks === null ? 'All frameworks' : `${currentEnabledFrameworks.length} frameworks`}
              {' · '}{currentEnabledFeatures === null ? 'All features' : `${currentEnabledFeatures.length} features`}
            </p>
          )}
        </div>
      </GlassCard>

      {togglesTargetUserId && (
        <>
          <GlassCard border rounded="xl">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <FiSliders className="text-violet-400" />
                Quick Presets
              </h3>
              <p className="text-xs text-white/50 mt-1">One click to configure for a specific company type.</p>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {TOGGLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="text-left p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-violet-500/10 hover:border-violet-400/30 transition-all group"
                >
                  <div className="text-2xl mb-1">{preset.emoji}</div>
                  <div className="text-sm font-semibold text-white group-hover:text-violet-300">{preset.label}</div>
                  <div className="text-[11px] text-white/50 mt-1 leading-tight">{preset.description}</div>
                  {preset.id !== 'full-suite' && preset.agents && preset.frameworks && (
                    <div className="text-[10px] text-violet-400/60 mt-2">{preset.agents.length} agents · {preset.frameworks.length} frameworks</div>
                  )}
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard border rounded="xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                  <FiToggleRight className="text-violet-400" />
                  Auditor Agents
                </h3>
                <p className="text-xs text-white/50 mt-1">
                  {effectiveAgents.length} of {ALL_NON_HOST_AGENT_IDS.length} enabled
                  {draftAgents === null && <span className="text-green-400/70 ml-1">(all)</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setDraftAgents(null); setTogglesDirty(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 border border-green-500/30">Enable All</button>
                <button onClick={() => { setDraftAgents([]); setTogglesDirty(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30">Disable All</button>
              </div>
            </div>
            <div className="p-4 space-y-5">
              {(Object.entries(agentsByCategory) as [AuditAgentCategory, typeof AGENT_TYPES][]).map(([cat, agents]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">{CATEGORY_LABELS[cat]}</h4>
                    <div className="flex gap-1">
                      <button onClick={() => { const catIds = agents.map(a => a.id); const current = draftAgents ?? ALL_NON_HOST_AGENT_IDS; setDraftAgents([...new Set([...current, ...catIds])]); setTogglesDirty(true); }} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400/70 hover:text-green-300">all on</button>
                      <button onClick={() => { const catIds = new Set(agents.map(a => a.id)); const current = draftAgents ?? ALL_NON_HOST_AGENT_IDS; setDraftAgents(current.filter(id => !catIds.has(id))); setTogglesDirty(true); }} className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400/70 hover:text-red-300">all off</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {agents.map((agent) => {
                      const enabled = effectiveAgents.includes(agent.id);
                      return (
                        <button key={agent.id} onClick={() => toggleAgent(agent.id)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${enabled ? 'bg-white/5 border-white/15 hover:border-violet-400/30' : 'bg-white/[0.02] border-white/5 opacity-50 hover:opacity-70'}`}>
                          {enabled ? <FiToggleRight className="text-violet-400 flex-shrink-0 text-lg" /> : <FiToggleLeft className="text-white/30 flex-shrink-0 text-lg" />}
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${enabled ? agent.color : 'text-white/40'}`}>{agent.name}</p>
                            <p className="text-[11px] text-white/40 truncate">{agent.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard border rounded="xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                  <FiCheckCircle className="text-violet-400" />
                  Checklist Frameworks
                </h3>
                <p className="text-xs text-white/50 mt-1">
                  {effectiveFrameworks.length} of {ALL_FRAMEWORK_IDS.length} enabled
                  {draftFrameworks === null && <span className="text-green-400/70 ml-1">(all)</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setDraftFrameworks(null); setTogglesDirty(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 border border-green-500/30">Enable All</button>
                <button onClick={() => { setDraftFrameworks([]); setTogglesDirty(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30">Disable All</button>
              </div>
            </div>
            <div className="p-4 space-y-5">
              {Object.entries(frameworksByCategory).map(([cat, templates]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">{cat}</h4>
                    <div className="flex gap-1">
                      <button onClick={() => { const catIds = templates.map(t => t.framework); const current = draftFrameworks ?? ALL_FRAMEWORK_IDS; setDraftFrameworks([...new Set([...current, ...catIds])]); setTogglesDirty(true); }} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400/70 hover:text-green-300">all on</button>
                      <button onClick={() => { const catIds = new Set(templates.map(t => t.framework)); const current = draftFrameworks ?? ALL_FRAMEWORK_IDS; setDraftFrameworks(current.filter(id => !catIds.has(id))); setTogglesDirty(true); }} className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400/70 hover:text-red-300">all off</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {templates.map((tmpl) => {
                      const enabled = effectiveFrameworks.includes(tmpl.framework);
                      return (
                        <button key={tmpl.framework} onClick={() => toggleFramework(tmpl.framework)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${enabled ? 'bg-white/5 border-white/15 hover:border-violet-400/30' : 'bg-white/[0.02] border-white/5 opacity-50 hover:opacity-70'}`}>
                          {enabled ? <FiToggleRight className="text-violet-400 flex-shrink-0 text-lg" /> : <FiToggleLeft className="text-white/30 flex-shrink-0 text-lg" />}
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${enabled ? 'text-white' : 'text-white/40'}`}>{tmpl.label}</p>
                            <p className="text-[11px] text-white/40">{tmpl.version}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard border rounded="xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                  <FiSliders className="text-violet-400" />
                  App Features
                </h3>
                <p className="text-xs text-white/50 mt-1">{effectiveFeatures.length} of {ALL_FEATURE_KEYS.length} enabled</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setDraftFeatures([...ALL_FEATURE_KEYS]); setTogglesDirty(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 border border-green-500/30">Enable All</button>
                <button onClick={() => { setDraftFeatures([]); setTogglesDirty(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30">Disable All</button>
              </div>
            </div>
            <div className="p-4 space-y-5">
              {FEATURE_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">{group.label}</h4>
                    <div className="flex gap-1">
                      <button onClick={() => { const groupKeys = group.keys as string[]; const current = draftFeatures ?? []; setDraftFeatures([...new Set([...current, ...groupKeys])]); setTogglesDirty(true); }} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400/70 hover:text-green-300">all on</button>
                      <button onClick={() => { const groupKeySet = new Set<string>(group.keys); const current = draftFeatures ?? []; setDraftFeatures(current.filter(k => !groupKeySet.has(k))); setTogglesDirty(true); }} className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400/70 hover:text-red-300">all off</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.keys.map((key) => {
                      const enabled = effectiveFeatures.includes(key);
                      return (
                        <button key={key} onClick={() => { const current = draftFeatures ?? []; setDraftFeatures(current.includes(key) ? current.filter(k => k !== key) : [...current, key]); setTogglesDirty(true); }} className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${enabled ? 'bg-white/5 border-white/15 hover:border-violet-400/30' : 'bg-white/[0.02] border-white/5 opacity-50 hover:opacity-70'}`}>
                          {enabled ? <FiToggleRight className="text-violet-400 flex-shrink-0 text-lg" /> : <FiToggleLeft className="text-white/30 flex-shrink-0 text-lg" />}
                          <p className={`text-sm font-medium truncate ${enabled ? 'text-white' : 'text-white/40'}`}>{FEATURE_LABELS[key]}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div>
              {togglesDirty ? <p className="text-sm text-amber-300">Unsaved changes — click Save to apply.</p> : <p className="text-sm text-white/50">No unsaved changes.</p>}
            </div>
            <button onClick={handleSaveToggles} disabled={!togglesDirty || togglesSaving} className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${togglesDirty && !togglesSaving ? 'bg-violet-500 hover:bg-violet-400 text-white' : 'bg-white/10 text-white/40 cursor-not-allowed'}`}>
              {togglesSaving ? 'Saving…' : 'Save Toggles'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
