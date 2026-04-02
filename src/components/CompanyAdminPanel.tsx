import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ALL_FEATURE_KEYS, FEATURE_LABELS } from "../config/featureKeys";
import { AUDIT_AGENTS } from "../services/auditAgents";
import { AUDIT_CHECKLIST_TEMPLATES } from "../config/auditChecklistTemplates";
import {
  useAddCompanyMember,
  useAllCompaniesAdmin,
  useAllUsers,
  useAssignCompanySupportUser,
  useCompanyFeaturePolicy,
  useCompanyMembers,
  useCompanySupportAssignments,
  useCreateCompany,
  useRemoveCompanyMember,
  useRemoveCompanySupportAssignment,
  useUpsertCompanyFeaturePolicy,
} from "../hooks/useConvexData";
import { SearchableUserPicker } from "./SearchableUserPicker";

const COMPANY_ROLES = ["company_admin", "company_manager", "company_user"] as const;
const FRAMEWORK_IDS = Array.from(new Set(AUDIT_CHECKLIST_TEMPLATES.map((template) => template.framework)));
const AGENT_IDS = AUDIT_AGENTS.filter((agent) => agent.id !== "audit-host").map((agent) => agent.id);

type Props = {
  className?: string;
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

export default function CompanyAdminPanel({ className }: Props) {
  const companies = (useAllCompaniesAdmin() || []) as any[];
  const users = (useAllUsers() || []) as any[];
  const createCompany = useCreateCompany();
  const addMember = useAddCompanyMember();
  const removeMember = useRemoveCompanyMember();
  const assignSupport = useAssignCompanySupportUser();
  const removeSupport = useRemoveCompanySupportAssignment();
  const upsertPolicy = useUpsertCompanyFeaturePolicy();

  const [companyName, setCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [memberUserId, setMemberUserId] = useState<string>("");
  const [memberRole, setMemberRole] = useState<(typeof COMPANY_ROLES)[number]>("company_user");
  const [supportUserId, setSupportUserId] = useState<string>("");

  const memberships = (useCompanyMembers(selectedCompanyId || undefined) || []) as any[];
  const supportAssignments = (useCompanySupportAssignments(selectedCompanyId || undefined) || []) as any[];
  const policy = useCompanyFeaturePolicy(selectedCompanyId || undefined) as any;

  const [policyFeatures, setPolicyFeatures] = useState<string[] | null>(null);
  const [policyAgents, setPolicyAgents] = useState<string[] | null>(null);
  const [policyFrameworks, setPolicyFrameworks] = useState<string[] | null>(null);
  const [policyLogbook, setPolicyLogbook] = useState<boolean | undefined>(undefined);
  const [policyMode, setPolicyMode] = useState<"addon" | "standalone" | undefined>(undefined);
  const lastSyncedCompanyIdRef = useRef<string>("");

  const userByClerk = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((user) => map.set(user.clerkUserId, user));
    return map;
  }, [users]);

  const aerogapUsers = users.filter((user) => user.role === "aerogap_employee" || user.role === "admin");

  const policySyncKey =
    policy === undefined ? "loading" : policy === null ? "null" : `${policy._id}:${policy.updatedAt ?? ""}`;

  useEffect(() => {
    if (!selectedCompanyId) {
      lastSyncedCompanyIdRef.current = "";
      setPolicyFeatures(null);
      setPolicyAgents(null);
      setPolicyFrameworks(null);
      setPolicyLogbook(undefined);
      setPolicyMode(undefined);
      return;
    }

    if (lastSyncedCompanyIdRef.current !== selectedCompanyId) {
      lastSyncedCompanyIdRef.current = selectedCompanyId;
      setPolicyFeatures(null);
      setPolicyAgents(null);
      setPolicyFrameworks(null);
      setPolicyLogbook(undefined);
      setPolicyMode(undefined);
    }

    if (policy === undefined) {
      return;
    }

    const p = policy;
    setPolicyFeatures(p?.enabledFeatures ?? null);
    setPolicyAgents(p?.enabledAgents ?? null);
    setPolicyFrameworks(p?.enabledFrameworks ?? null);
    setPolicyLogbook(p?.logbookEnabled);
    setPolicyMode(p?.logbookEntitlementMode);
  // policySyncKey already reflects policy identity; including `policy` would re-run on every query reference.
  }, [selectedCompanyId, policySyncKey]);

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
        logbookEnabled: policyLogbook,
        logbookEntitlementMode: policyMode,
      } as any);
      toast.success("Company policy updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save company policy");
    }
  };

  return (
    <div className={className}>
      <div className="grid gap-4 md:grid-cols-2">
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
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
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
        </div>
      </div>

      {selectedCompanyId && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Members</h3>
            <div className="flex flex-wrap gap-2 mb-3 items-start">
              <SearchableUserPicker
                users={users}
                value={memberUserId}
                onChange={setMemberUserId}
                placeholder="Search user by name or email…"
              />
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

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={policyLogbook === true}
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
        </div>
      )}
    </div>
  );
}
