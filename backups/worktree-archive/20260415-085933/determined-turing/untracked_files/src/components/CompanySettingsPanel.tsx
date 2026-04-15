import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FiBriefcase, FiShield, FiUsers } from "react-icons/fi";
import {
  useAddCompanyMember,
  useAllUsers,
  useCompaniesForCurrentUser,
  useCompanyMembers,
  useIsAerogapEmployee,
  useListMyMemberships,
  useRemoveCompanyMember,
  useUpdateCompanyMember,
} from "../hooks/useConvexData";
import { SearchableUserPicker } from "./SearchableUserPicker";
import { useFocusViewHeading } from "../hooks/useFocusViewHeading";
import { useTheme } from "../context/ThemeContext";

const COMPANY_ROLES = ["company_admin", "company_manager", "company_user"] as const;

function roleLabel(role: string): string {
  if (role === "company_admin") return "Admin";
  if (role === "company_manager") return "Manager";
  return "User";
}

function statusBadge(status: string | undefined) {
  if (status === "active" || !status) return { label: "Active", cls: "text-green-400 bg-green-500/10 border-green-500/20" };
  if (status === "invited") return { label: "Invited", cls: "text-amber-300 bg-amber-500/10 border-amber-500/20" };
  return { label: "Suspended", cls: "text-red-300 bg-red-500/10 border-red-400/20" };
}

function getInitials(name: string | undefined | null, email: string | undefined | null): string {
  const src = name || email || "?";
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src[0].toUpperCase();
}

export default function CompanySettingsPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  // Platform-privileged users (admin / aerogap_employee) bypass company-role checks
  // and listForCurrentUser already returns ALL companies for them.
  const isAerogapEmployee = useIsAerogapEmployee();

  const companies = (useCompaniesForCurrentUser() || []) as any[];
  const myMemberships = (useListMyMemberships() || []) as any[];
  const users = (useAllUsers() || []) as any[];

  const addMember = useAddCompanyMember();
  const removeMember = useRemoveCompanyMember();
  const updateMember = useUpdateCompanyMember();

  // Companies this user can manage:
  // - AeroGap admins → all companies (listForCurrentUser already returns all for them)
  // - Regular company admins → only companies where they have company_admin membership
  const adminCompanyIds = useMemo(
    () =>
      new Set(
        myMemberships
          .filter((m: any) => m.role === "company_admin" && m.status !== "suspended")
          .map((m: any) => m.companyId as string)
      ),
    [myMemberships]
  );

  const manageableCompanies = useMemo(
    () => isAerogapEmployee ? companies : companies.filter((c: any) => adminCompanyIds.has(c._id)),
    [companies, adminCompanyIds, isAerogapEmployee]
  );

  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    return typeof window !== "undefined"
      ? localStorage.getItem("aerogap_company_settings_active") || ""
      : "";
  });

  const isValidActive = activeCompanyId && manageableCompanies.some((c: any) => c._id === activeCompanyId);
  const resolvedCompanyId = isValidActive ? activeCompanyId : (manageableCompanies[0]?._id || "");

  const activeCompany = manageableCompanies.find((c: any) => c._id === resolvedCompanyId);

  const handleSelectCompany = (id: string) => {
    setActiveCompanyId(id);
    localStorage.setItem("aerogap_company_settings_active", id);
  };

  const members = (useCompanyMembers(resolvedCompanyId || undefined) || []) as any[];

  const userByClerk = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((u: any) => map.set(u.clerkUserId, u));
    return map;
  }, [users]);

  const [addPickerUserId, setAddPickerUserId] = useState("");
  const [addRole, setAddRole] = useState<(typeof COMPANY_ROLES)[number]>("company_user");

  const memberUserIds = useMemo(() => new Set(members.map((m: any) => m.userId)), [members]);
  const pickerUsers = useMemo(() => users.filter((u: any) => !memberUserIds.has(u.clerkUserId)), [users, memberUserIds]);

  const adminCount = members.filter((m: any) => m.role === "company_admin" && m.status !== "suspended").length;

  const handleAddMember = async () => {
    if (!resolvedCompanyId || !addPickerUserId) return;
    try {
      await addMember({
        companyId: resolvedCompanyId as any,
        userId: addPickerUserId,
        role: addRole,
        status: "active",
      } as any);
      toast.success("Member added");
      setAddPickerUserId("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to add member");
    }
  };

  const handleRoleChange = async (membershipId: string, newRole: (typeof COMPANY_ROLES)[number], currentRole: string) => {
    if (!isAerogapEmployee && currentRole === "company_admin" && newRole !== "company_admin" && adminCount <= 1) {
      toast.warning("Cannot demote the last company admin");
      return;
    }
    try {
      await updateMember({
        companyId: resolvedCompanyId as any,
        membershipId: membershipId as any,
        role: newRole,
      } as any);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update role");
    }
  };

  const handleRemoveMember = async (membershipId: string, memberRole: string) => {
    if (!isAerogapEmployee && memberRole === "company_admin" && adminCount <= 1) {
      toast.warning("Cannot remove the last company admin");
      return;
    }
    try {
      await removeMember({
        companyId: resolvedCompanyId as any,
        membershipId: membershipId as any,
      } as any);
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove member");
    }
  };

  const cardClass = isDarkMode
    ? "rounded-xl border border-white/10 bg-white/5"
    : "rounded-xl border border-slate-200 bg-white shadow-sm";

  const textPrimary = isDarkMode ? "text-white" : "text-slate-900";
  const textMuted = isDarkMode ? "text-white/60" : "text-slate-500";
  const inputClass = isDarkMode
    ? "bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
    : "bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900";

  // Empty state — no manageable companies
  if (manageableCompanies.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8">
        <FiBriefcase className={`text-4xl ${textMuted} opacity-40`} />
        <div className="text-center">
          <h2 className={`text-lg font-semibold ${textPrimary}`}>No companies found</h2>
          <p className={`text-sm mt-1 ${textMuted}`}>
            {isAerogapEmployee
              ? "No companies have been created yet."
              : "You are not an admin of any company. Contact your platform administrator."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FiBriefcase className={`text-2xl ${isDarkMode ? "text-sky-lighter" : "text-sky-600"}`} />
        <div>
          <h1 className={`text-xl font-display font-bold ${textPrimary}`}>
            Company Settings
          </h1>
          <p className={`text-sm ${textMuted}`}>
            {isAerogapEmployee
              ? `Viewing all ${manageableCompanies.length} compan${manageableCompanies.length === 1 ? "y" : "ies"} as platform admin.`
              : "Manage your company's members and access."}
          </p>
        </div>
      </div>

      {/* Company selector — shown when there are multiple manageable companies */}
      {manageableCompanies.length > 1 && (
        <div className={`${cardClass} p-4`}>
          <label className={`block text-xs font-medium mb-2 ${textMuted}`}>
            Select Company
          </label>
          <select
            value={resolvedCompanyId}
            onChange={(e) => handleSelectCompany(e.target.value)}
            className={`w-full ${inputClass}`}
          >
            {manageableCompanies.map((c: any) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Company info card */}
      {activeCompany && (
        <div className={`${cardClass} p-4 flex items-start gap-3`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? "bg-sky/20" : "bg-sky-50"}`}>
            <FiBriefcase className={isDarkMode ? "text-sky-lighter" : "text-sky-600"} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className={`font-semibold ${textPrimary}`}>{activeCompany.name}</h2>
            {activeCompany.slug && (
              <p className={`text-xs font-mono ${textMuted}`}>{activeCompany.slug}</p>
            )}
            <p className={`text-xs ${textMuted} mt-0.5`}>
              {members.length} member{members.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className={`ml-auto flex items-center gap-1.5 text-xs px-2 py-1 rounded border shrink-0 ${
            isAerogapEmployee
              ? (isDarkMode ? "text-amber-300 bg-amber-500/10 border-amber-500/20" : "text-amber-700 bg-amber-50 border-amber-200")
              : (isDarkMode ? "text-sky-lighter bg-sky/10 border-sky-light/20" : "text-sky-700 bg-sky-50 border-sky-200")
          }`}>
            <FiShield className="text-[11px]" />
            {isAerogapEmployee ? "Platform Admin" : "Admin"}
          </div>
        </div>
      )}

      {/* Members section */}
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-semibold flex items-center gap-2 ${textPrimary}`}>
            <FiUsers className="text-sm" />
            Members
            <span className={`text-xs px-1.5 py-0.5 rounded border ${isDarkMode ? "bg-white/5 border-white/10 text-white/50" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
              {members.length}
            </span>
          </h3>
        </div>

        {/* Add member row */}
        <div className={`flex flex-wrap gap-2 mb-4 pb-4 border-b ${isDarkMode ? "border-white/10" : "border-slate-100"}`}>
          <SearchableUserPicker
            users={pickerUsers}
            value={addPickerUserId}
            onChange={setAddPickerUserId}
            placeholder="Search user by name or email…"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as any)}
            className={`shrink-0 ${inputClass}`}
          >
            {COMPANY_ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddMember}
            disabled={!addPickerUserId}
            className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
              isDarkMode
                ? "bg-sky/20 text-sky-lighter border border-sky-light/30 hover:bg-sky/30"
                : "bg-sky-600 text-white hover:bg-sky-700"
            }`}
          >
            Add Member
          </button>
        </div>

        {/* Member list */}
        {members.length === 0 ? (
          <p className={`text-sm italic text-center py-4 ${textMuted}`}>No members yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((membership: any) => {
              const dbUser = userByClerk.get(membership.userId);
              const name = dbUser?.name || dbUser?.email || membership.userId;
              const email = dbUser?.email || "";
              const badge = statusBadge(membership.status);

              return (
                <div
                  key={membership._id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isDarkMode ? "bg-white/5" : "bg-slate-50 border border-slate-100"}`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDarkMode ? "bg-sky/20 text-sky-lighter" : "bg-sky-100 text-sky-700"}`}>
                    {getInitials(dbUser?.name, dbUser?.email)}
                  </div>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${textPrimary}`}>{name}</p>
                    {email && email !== name && <p className={`text-xs truncate ${textMuted}`}>{email}</p>}
                  </div>
                  {/* Status badge */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {/* Role selector */}
                  <select
                    value={membership.role}
                    onChange={(e) => handleRoleChange(membership._id, e.target.value as any, membership.role)}
                    className={`shrink-0 text-xs rounded px-2 py-1 border ${isDarkMode ? "bg-white/5 border-white/20 text-white" : "bg-white border-slate-200 text-slate-700"}`}
                  >
                    {COMPANY_ROLES.map((r) => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(membership._id, membership.role)}
                    className="text-xs px-2 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-500/10 shrink-0 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
