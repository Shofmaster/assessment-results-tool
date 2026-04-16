import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "convex/react";
import { convexToJson } from "convex/values";
import { useQuery } from "../hooks/useConvexQueryNoThrow";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { ALL_FEATURE_KEYS, FEATURE_LABELS } from "../config/featureKeys";
import { COMPANY_FEATURE_PRESETS, type CompanyFeaturePresetId } from "../config/featureBundles";
import { AUDIT_AGENTS } from "../services/auditAgents";
import { AUDIT_CHECKLIST_TEMPLATES } from "../config/auditChecklistTemplates";
import {
  useAddCompanyMember,
  useAssignCompanySupportUser,
  useCompanyFeaturePolicy,
  useCompanyMembers,
  useCompanySupportAssignments,
  useCreateCompany,
  useListWhereCanManageProjectsCompanies,
  useMyAdminCompanies,
  useRemoveCompanyMember,
  useRemoveCompanySupportAssignment,
  useUpsertCompanyFeaturePolicy,
} from "../hooks/useConvexData";
import { SearchableUserPicker } from "./SearchableUserPicker";
import CompanyProfilePanel from "./company-profile/CompanyProfilePanel";

const COMPANY_ROLES = ["company_admin", "company_manager", "company_user"] as const;
const FRAMEWORK_IDS = Array.from(new Set(AUDIT_CHECKLIST_TEMPLATES.map((template) => template.framework)));
const AGENT_IDS = AUDIT_AGENTS.filter((agent) => agent.id !== "audit-host").map((agent) => agent.id);

type PanelMode = "platform" | "tenant";

type Props = {
  className?: string;
  mode?: PanelMode;
};

/** null = all keys enabled; [] = none; else whitelist only. */
function isPolicyKeyEnabled(list: string[] | null | undefined, id: string): boolean {
  return list == null || list.includes(id);
}

function togglePolicyList(
  list: string[] | null,
  id: string,
  allKeys: readonly string[],
): string[] | null {
  if (list === null) {
    return allKeys.filter((k) => k !== id);
  }
  const has = list.includes(id);
  const next = has ? list.filter((k) => k !== id) : [...list, id];
  if (next.length === allKeys.length && allKeys.every((k) => next.includes(k))) {
    return null;
  }
  return next;
}

export default function CompanyAdminPanel({ className, mode = "platform" }: Props) {
  const platformCompanyRows = useQuery(api.companies.listAll, mode === "platform" ? {} : "skip");
  const tenantAdminRows = useMyAdminCompanies();
  const tenantManageRows = useListWhereCanManageProjectsCompanies();
  const companies = useMemo(() => {
    if (mode === "platform") {
      return ((platformCompanyRows ?? []) as any[]);
    }
    const byId = new Map<string, any>();
    for (const row of (tenantManageRows ?? []) as any[]) {
      byId.set(String(row._id), row);
    }
    for (const row of (tenantAdminRows ?? []) as any[]) {
      byId.set(String(row._id), row);
    }
    return Array.from(byId.values());
  }, [mode, platformCompanyRows, tenantManageRows, tenantAdminRows]);
  const tenantAdminCompanyIds = useMemo(
    () => new Set(((tenantAdminRows ?? []) as any[]).map((row) => String(row._id))),
    [tenantAdminRows],
  );

  const createCompany = useCreateCompany();
  const addMember = useAddCompanyMember();
  const removeMember = useRemoveCompanyMember();
  const assignSupport = useAssignCompanySupportUser();
  const removeSupport = useRemoveCompanySupportAssignment();
  const upsertPolicy = useUpsertCompanyFeaturePolicy();

  const [companyName, setCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  const canManageUsers = mode === "platform" || tenantAdminCompanyIds.has(String(selectedCompanyId));

  const directoryUsers = useQuery(
    api.users.listDirectoryForCompany,
    mode === "platform" && selectedCompanyId
      ? { companyId: selectedCompanyId as any, includePlatformStaff: true }
      : "skip",
  );
  const users = (mode === "platform" ? (directoryUsers ?? []) : []) as any[];

  const [memberUserId, setMemberUserId] = useState<string>("");
  const [memberRole, setMemberRole] = useState<(typeof COMPANY_ROLES)[number]>("company_user");
  const [supportUserId, setSupportUserId] = useState<string>("");
  const [memberEmailInput, setMemberEmailInput] = useState("");
  const [memberEmailLookup, setMemberEmailLookup] = useState("");

  const memberLookupSpec = useMemo(() => {
    if (!selectedCompanyId || !memberEmailLookup) return null;
    return {
      companyId: selectedCompanyId as any,
      email: memberEmailLookup,
    };
  }, [selectedCompanyId, memberEmailLookup]);

  const memberLookupQueries = useMemo(() => {
    if (!memberLookupSpec) return {};
    return {
      memberLookup: {
        query: api.users.lookupByEmailForCompanyAdmin,
        args: memberLookupSpec,
      },
    };
    // Stable when args match Convex JSON shape (matches useConvexQueryNoThrow pattern).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberLookupSpec ? JSON.stringify(convexToJson(memberLookupSpec as any)) : ""]);

  const memberLookupResults = useQueries(memberLookupQueries as any);
  const memberLookupRaw = memberLookupResults["memberLookup"];
  const memberLookupError =
    memberLookupRaw instanceof Error ? memberLookupRaw.message : null;
  const lookedUpMember =
    memberLookupRaw instanceof Error ? undefined : (memberLookupRaw as any);
  const isMemberLookupLoading = Boolean(
    memberLookupSpec && memberLookupRaw === undefined && !memberLookupError,
  );

  const platformStaffPicker = useQuery(
    api.users.listPlatformStaffForSupportPicker,
    mode === "tenant" && selectedCompanyId
      ? { companyId: selectedCompanyId as any }
      : "skip",
  );

  const memberships = (useCompanyMembers(selectedCompanyId || undefined) || []) as any[];
  const supportAssignments = (useCompanySupportAssignments(selectedCompanyId || undefined) || []) as any[];
  const policy = useCompanyFeaturePolicy(selectedCompanyId || undefined) as any;

  const [policyFeatures, setPolicyFeatures] = useState<string[] | null>(null);
  const [policyAgents, setPolicyAgents] = useState<string[] | null>(null);
  const [policyFrameworks, setPolicyFrameworks] = useState<string[] | null>(null);
  const [policyLogbookRaw, setPolicyLogbookRaw] = useState<boolean | undefined>(undefined);
  const [policyLogbookTouched, setPolicyLogbookTouched] = useState(false);
  const [policyMode, setPolicyMode] = useState<"addon" | "standalone" | undefined>(undefined);
  const [policyForceCompanyContextDefault, setPolicyForceCompanyContextDefault] = useState<boolean | undefined>(undefined);
  const [policyWebhookUrl, setPolicyWebhookUrl] = useState("");
  const [policyWebhookSecret, setPolicyWebhookSecret] = useState("");
  const lastSyncedCompanyIdRef = useRef<string>("");

  const setPolicyLogbook = (value: boolean | undefined) => {
    setPolicyLogbookTouched(true);
    setPolicyLogbookRaw(value);
  };

  const userByClerk = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((user) => map.set(user.clerkUserId, user));
    (platformStaffPicker || []).forEach((user: any) => map.set(user.clerkUserId, user));
    if (lookedUpMember?.clerkUserId) {
      map.set(lookedUpMember.clerkUserId, lookedUpMember);
    }
    return map;
  }, [users, platformStaffPicker, lookedUpMember]);

  const aerogapUsers =
    mode === "tenant"
      ? ((platformStaffPicker || []) as any[])
      : users.filter((user) => user.role === "aerogap_employee" || user.role === "admin");

  const policySyncKey =
    policy === undefined ? "loading" : policy === null ? "null" : `${policy._id}:${policy.updatedAt ?? ""}`;

  useEffect(() => {
    if (!lookedUpMember?.clerkUserId) return;
    setMemberUserId(lookedUpMember.clerkUserId);
  }, [lookedUpMember]);

  useEffect(() => {
    setMemberEmailLookup("");
    setMemberEmailInput("");
    setMemberUserId("");
  }, [selectedCompanyId, mode]);

  useEffect(() => {
    if (mode !== "tenant" || !companies.length) return;
    if (selectedCompanyId) return;
    setSelectedCompanyId((companies[0] as any)._id);
  }, [mode, companies, selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) {
      lastSyncedCompanyIdRef.current = "";
      setPolicyFeatures(null);
      setPolicyAgents(null);
      setPolicyFrameworks(null);
      setPolicyLogbookRaw(undefined);
      setPolicyLogbookTouched(false);
      setPolicyMode(undefined);
      setPolicyForceCompanyContextDefault(undefined);
      setPolicyWebhookUrl("");
      setPolicyWebhookSecret("");
      return;
    }

    if (lastSyncedCompanyIdRef.current !== selectedCompanyId) {
      lastSyncedCompanyIdRef.current = selectedCompanyId;
      setPolicyFeatures(null);
      setPolicyAgents(null);
      setPolicyFrameworks(null);
      setPolicyLogbookRaw(undefined);
      setPolicyLogbookTouched(false);
      setPolicyMode(undefined);
      setPolicyForceCompanyContextDefault(undefined);
      setPolicyWebhookUrl("");
      setPolicyWebhookSecret("");
    }

    if (policy === undefined) {
      return;
    }

    const p = policy;
    setPolicyFeatures(p?.enabledFeatures ?? null);
    setPolicyAgents(p?.enabledAgents ?? null);
    setPolicyFrameworks(p?.enabledFrameworks ?? null);
    if (!policyLogbookTouched) {
      setPolicyLogbookRaw(p?.logbookEnabled);
    }
    setPolicyMode(p?.logbookEntitlementMode);
    setPolicyForceCompanyContextDefault(
      typeof p?.forceCompanyContextDefault === "boolean" ? p.forceCompanyContextDefault : undefined,
    );
    setPolicyWebhookUrl(typeof p?.carLifecycleWebhookUrl === "string" ? p.carLifecycleWebhookUrl : "");
    setPolicyWebhookSecret(typeof p?.carLifecycleWebhookSecret === "string" ? p.carLifecycleWebhookSecret : "");
  // policySyncKey already reflects policy identity; including `policy` would re-run on every query reference.
  }, [selectedCompanyId, policySyncKey, policyLogbookTouched]);

  const handleCreateCompany = async () => {
    if (!companyName.trim()) return;
    try {
      await createCompany({ name: companyName.trim() } as any);
      setCompanyName("");
      toast.success("Company created");
    } catch (error: any) {
      toast.error(error?.message || "Failed to create company");
    }
  };

  const handleAddMember = async () => {
    if (!selectedCompanyId || !memberUserId) return;
    try {
      await addMember({
        companyId: selectedCompanyId as any,
        userId: memberUserId,
        role: memberRole,
        status: "active",
      } as any);
      toast.success("Member added");
      setMemberUserId("");
    } catch (error: any) {
      toast.error(error?.message || "Failed to add member");
    }
  };

  const handleAssignSupport = async () => {
    if (!selectedCompanyId || !supportUserId) return;
    try {
      await assignSupport({
        companyId: selectedCompanyId as any,
        supportUserId,
        isActive: true,
      } as any);
      toast.success("Support assignment saved");
      setSupportUserId("");
    } catch (error: any) {
      toast.error(error?.message || "Failed to assign support user");
    }
  };

  const handleSavePolicy = async () => {
    if (!selectedCompanyId) return;
    try {
      await upsertPolicy({
        companyId: selectedCompanyId as any,
        enabledFeatures: policyFeatures,
        enabledAgents: policyAgents,
        enabledFrameworks: policyFrameworks,
        logbookEnabled: policyLogbookRaw,
        logbookEntitlementMode: policyMode,
        forceCompanyContextDefault: policyForceCompanyContextDefault ?? null,
        carLifecycleWebhookUrl: policyWebhookUrl.trim() || null,
        carLifecycleWebhookSecret: policyWebhookSecret.trim() || null,
      } as any);
      setPolicyLogbookTouched(false);
      toast.success("Company policy updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save company policy");
    }
  };

  const handleApplyFeaturePreset = (presetId: CompanyFeaturePresetId) => {
    const preset = COMPANY_FEATURE_PRESETS[presetId];
    setPolicyFeatures(preset.enabledFeatures);
    setPolicyLogbook(preset.logbookEnabled);
    if (presetId === "full-platform") {
      setPolicyAgents(null);
      setPolicyFrameworks(null);
    }
    toast.message(`${preset.label} applied locally`, {
      description: "Click Save Policy to persist for this company.",
    });
  };

  return (
    <div className={className}>
      <div className={`grid gap-4 ${mode === "platform" ? "md:grid-cols-2" : ""}`}>
        {mode === "platform" && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Create Company</h3>
          <div className="flex gap-2">
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Company name"
              className="flex-1 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
            />
            <button
              onClick={handleCreateCompany}
              className="px-3 py-2 rounded-lg bg-sky/20 text-sky-lighter border border-sky-light/30 text-sm"
              type="button"
            >
              Create
            </button>
          </div>
        </div>
        )}
        <div className={`rounded-xl border border-white/10 bg-white/5 p-4 ${mode === "tenant" ? "md:col-span-2" : ""}`}>
          <h3 className="text-lg font-semibold text-white mb-3">Select Company</h3>
          <select
            value={selectedCompanyId}
            onChange={(event) => {
              setSelectedCompanyId(event.target.value);
            }}
            className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">Choose company</option>
            {companies.map((company) => (
              <option key={company._id} value={company._id}>
                {company.name}
              </option>
            ))}
          </select>
          {!selectedCompanyId && (
            <p className="mt-2 text-xs text-white/55">
              Select a company to manage organization profile, ratings, capabilities, and company policy.
            </p>
          )}
          {selectedCompanyId && (
            <Link
              to={`/companies/${selectedCompanyId}/projects`}
              className="mt-3 inline-flex items-center justify-center w-full px-3 py-2 rounded-lg border border-sky-light/35 bg-sky/15 text-sky-lighter text-sm font-medium hover:bg-sky/25"
            >
              Manage projects
            </Link>
          )}
        </div>
      </div>

      {selectedCompanyId && (
        <>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-lg font-semibold text-white">Company profile</h3>
            <p className="text-xs text-white/55 mt-1 max-w-2xl">
              Shared for every project under this organization (checklists, DCT applicability, audit prep). Company admins
              and managers can edit; project users see this data automatically.
            </p>
          </div>
          <CompanyProfilePanel companyId={selectedCompanyId} mode={mode} />
        </>
      )}

      {selectedCompanyId && (
        <>
          {canManageUsers ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Members</h3>
            <div className="flex flex-wrap gap-2 mb-3 items-start">
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="email"
                  value={memberEmailInput}
                  onChange={(e) => setMemberEmailInput(e.target.value)}
                  placeholder="User email"
                  className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white min-w-[12rem]"
                />
                <button
                  type="button"
                  onClick={() => setMemberEmailLookup(memberEmailInput.trim())}
                  className="px-3 py-2 rounded-lg border border-white/20 text-sm text-white/90 hover:bg-white/5"
                >
                  Look up
                </button>
                {memberLookupError && (
                  <span className="text-xs text-red-300 max-w-[14rem]">
                    Could not look up user — check permissions or try again.
                  </span>
                )}
                {isMemberLookupLoading && (
                  <span className="text-xs text-white/50">Looking up...</span>
                )}
                {memberEmailLookup &&
                  lookedUpMember === null &&
                  !memberLookupError &&
                  !isMemberLookupLoading && (
                  <span className="text-xs text-amber-300">No user found for that email.</span>
                )}
                {lookedUpMember && (
                  <span className="text-xs text-white/70 truncate max-w-[14rem]">
                    {lookedUpMember.name || lookedUpMember.email || lookedUpMember.clerkUserId}
                  </span>
                )}
              </div>
              <select
                value={memberRole}
                onChange={(event) => setMemberRole(event.target.value as any)}
                className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
              >
                {COMPANY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddMember}
                className="px-3 py-2 rounded-lg bg-sky/20 text-sky-lighter border border-sky-light/30 text-sm"
                type="button"
              >
                Add
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-auto">
              {memberships.map((membership) => (
                <div key={membership._id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">
                      {userByClerk.get(membership.userId)?.name || userByClerk.get(membership.userId)?.email || membership.userId}
                    </p>
                    <p className="text-xs text-white/60">{membership.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      removeMember({
                        companyId: selectedCompanyId as any,
                        membershipId: membership._id,
                      } as any)
                    }
                    className="text-xs px-2 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-lg font-semibold text-white mb-3">Delegated Support</h3>
              <div className="flex flex-wrap gap-2 mb-3 items-start">
                <SearchableUserPicker
                  users={aerogapUsers}
                  value={supportUserId}
                  onChange={setSupportUserId}
                  placeholder="Search AeroGap user…"
                />
                <button
                  onClick={handleAssignSupport}
                  className="px-3 py-2 rounded-lg bg-sky/20 text-sky-lighter border border-sky-light/30 text-sm"
                  type="button"
                >
                  Assign
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-auto">
                {supportAssignments.map((assignment) => (
                  <div key={assignment._id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">
                        {userByClerk.get(assignment.supportUserId)?.name || userByClerk.get(assignment.supportUserId)?.email || assignment.supportUserId}
                      </p>
                      <p className="text-xs text-white/60">{assignment.isActive ? "active" : "inactive"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        removeSupport({
                          companyId: selectedCompanyId as any,
                          assignmentId: assignment._id,
                        } as any)
                      }
                      className="text-xs px-2 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-500/10"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          ) : (
            <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
              You can edit organization profile, ratings, and capabilities. Member management and delegated support
              require company admin access.
            </div>
          )}
        </>
      )}

      {selectedCompanyId && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Company Policy</h3>
            <button
              type="button"
              onClick={handleSavePolicy}
              className="px-3 py-2 rounded-lg bg-sky/20 text-sky-lighter border border-sky-light/30 text-sm"
            >
              Save Policy
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2 items-start">
            {(Object.keys(COMPANY_FEATURE_PRESETS) as CompanyFeaturePresetId[]).map((id) => {
              const preset = COMPANY_FEATURE_PRESETS[id];
              return (
                <button
                  key={id}
                  type="button"
                  title={preset.description}
                  onClick={() => handleApplyFeaturePreset(id)}
                  className="px-3 py-2 rounded-lg border border-white/20 text-white/85 text-sm hover:bg-white/5 text-left"
                >
                  <span className="font-medium block">{preset.label}</span>
                  <span className="text-[10px] text-white/50 block max-w-[14rem] leading-snug mt-0.5">
                    {id === "qm-core" ? "CI/QM-focused bundle" : "All modules on"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-4 grid gap-2 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setPolicyFeatures(null)}
              className="px-3 py-2 rounded border border-white/20 text-white/80 text-sm"
            >
              Features: All Enabled
            </button>
            <button
              type="button"
              onClick={() => setPolicyAgents(null)}
              className="px-3 py-2 rounded border border-white/20 text-white/80 text-sm"
            >
              Agents: All Enabled
            </button>
            <button
              type="button"
              onClick={() => setPolicyFrameworks(null)}
              className="px-3 py-2 rounded border border-white/20 text-white/80 text-sm"
            >
              Frameworks: All Enabled
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm text-white/80">Features</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPolicyFeatures(null)}
                    className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400/80 hover:text-green-300 border border-green-500/20"
                  >
                    Enable all
                  </button>
                  <button
                    type="button"
                    onClick={() => setPolicyFeatures([])}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400/80 hover:text-red-300 border border-red-500/20"
                  >
                    Disable all
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-48 overflow-auto">
                {ALL_FEATURE_KEYS.map((feature) => {
                  const enabled = isPolicyKeyEnabled(policyFeatures, feature);
                  return (
                    <label key={feature} className="flex items-center gap-2 text-xs text-white/80">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() =>
                          setPolicyFeatures(togglePolicyList(policyFeatures, feature, ALL_FEATURE_KEYS))
                        }
                      />
                      {FEATURE_LABELS[feature]}
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm text-white/80">Agents</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPolicyAgents(null)}
                    className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400/80 hover:text-green-300 border border-green-500/20"
                  >
                    Enable all
                  </button>
                  <button
                    type="button"
                    onClick={() => setPolicyAgents([])}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400/80 hover:text-red-300 border border-red-500/20"
                  >
                    Disable all
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-48 overflow-auto">
                {AGENT_IDS.map((agentId) => {
                  const enabled = isPolicyKeyEnabled(policyAgents, agentId);
                  return (
                    <label key={agentId} className="flex items-center gap-2 text-xs text-white/80">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() =>
                          setPolicyAgents(togglePolicyList(policyAgents, agentId, AGENT_IDS))
                        }
                      />
                      {agentId}
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm text-white/80">Frameworks</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPolicyFrameworks(null)}
                    className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400/80 hover:text-green-300 border border-green-500/20"
                  >
                    Enable all
                  </button>
                  <button
                    type="button"
                    onClick={() => setPolicyFrameworks([])}
                    className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400/80 hover:text-red-300 border border-red-500/20"
                  >
                    Disable all
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-48 overflow-auto">
                {FRAMEWORK_IDS.map((framework) => {
                  const enabled = isPolicyKeyEnabled(policyFrameworks, framework);
                  return (
                    <label key={framework} className="flex items-center gap-2 text-xs text-white/80">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() =>
                          setPolicyFrameworks(
                            togglePolicyList(policyFrameworks, framework, FRAMEWORK_IDS),
                          )
                        }
                      />
                      {framework}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-2">
            <p className="text-sm font-medium text-white/90">CAR lifecycle webhook</p>
            <p className="text-xs text-white/55 leading-relaxed">
              Optional HTTPS URL that receives JSON POSTs when CARs are created, updated, or closed (headers:
              X-AeroGap-Event, optional X-AeroGap-Webhook-Secret). Use with Zapier, Make, or your QMS.
            </p>
            <input
              type="url"
              value={policyWebhookUrl}
              onChange={(e) => setPolicyWebhookUrl(e.target.value)}
              placeholder="https://example.com/hooks/aerogap-car"
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
            />
            <input
              type="password"
              value={policyWebhookSecret}
              onChange={(e) => setPolicyWebhookSecret(e.target.value)}
              placeholder="Optional shared secret"
              autoComplete="off"
              className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={policyLogbookRaw === true}
                onChange={(event) => setPolicyLogbook(event.target.checked)}
              />
              Logbook enabled
            </label>
            <select
              value={policyMode || ""}
              onChange={(event) => {
                const next = event.target.value;
                setPolicyMode(next === "addon" || next === "standalone" ? next : undefined);
              }}
              className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">No mode override</option>
              <option value="addon">Add-on</option>
              <option value="standalone">Standalone</option>
            </select>
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-medium text-white/90">Ask Agents company-context policy</p>
            <p className="mt-1 text-xs text-white/55">
              Optional tenant-wide override for Home Ask Agents grounding. When set, this enforces the force-context
              mode for all users in this company.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPolicyForceCompanyContextDefault(undefined)}
                className={`px-3 py-1.5 rounded-lg border text-xs ${
                  policyForceCompanyContextDefault === undefined
                    ? "border-sky/40 bg-sky/20 text-sky-lighter"
                    : "border-white/20 text-white/75 hover:bg-white/5"
                }`}
              >
                No override
              </button>
              <button
                type="button"
                onClick={() => setPolicyForceCompanyContextDefault(true)}
                className={`px-3 py-1.5 rounded-lg border text-xs ${
                  policyForceCompanyContextDefault === true
                    ? "border-sky/40 bg-sky/20 text-sky-lighter"
                    : "border-white/20 text-white/75 hover:bg-white/5"
                }`}
              >
                Force on
              </button>
              <button
                type="button"
                onClick={() => setPolicyForceCompanyContextDefault(false)}
                className={`px-3 py-1.5 rounded-lg border text-xs ${
                  policyForceCompanyContextDefault === false
                    ? "border-sky/40 bg-sky/20 text-sky-lighter"
                    : "border-white/20 text-white/75 hover:bg-white/5"
                }`}
              >
                Force off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
