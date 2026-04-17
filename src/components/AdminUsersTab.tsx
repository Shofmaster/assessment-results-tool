import { useMemo } from 'react';
import { FiSliders } from 'react-icons/fi';
import { toast } from 'sonner';
import { GlassCard } from './ui';
import {
  useUserDirectoryForCompany,
  useAllUserSettingsAdmin,
  useSetUserRole,
  useSetLogbookEntitlement,
} from '../hooks/useConvexData';

interface Props {
  adminScopeCompanyId: string | undefined;
  onConfigureUser: (userId: string) => void;
}

export default function AdminUsersTab({ adminScopeCompanyId, onConfigureUser }: Props) {
  const allUsers = useUserDirectoryForCompany(adminScopeCompanyId, true) as any[] | undefined;
  const allUserSettings = useAllUserSettingsAdmin() as any[] | undefined;
  const setRole = useSetUserRole();
  const setLogbookEntitlement = useSetLogbookEntitlement();

  const userSettingsByClerkId = useMemo(() => {
    const map = new Map<string, any>();
    for (const setting of (allUserSettings || [])) {
      if (setting?.userId) map.set(setting.userId, setting);
    }
    return map;
  }, [allUserSettings]);

  return (
    <GlassCard border rounded="xl">
      {!allUsers ? (
        <div className="p-8 text-center text-white/70">Loading users...</div>
      ) : allUsers.length === 0 ? (
        <div className="p-8 text-center text-white/70">No users found.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {allUsers.map((u: any) => {
            const uSettings = userSettingsByClerkId.get(u.clerkUserId);
            const uAgents = uSettings?.enabledAgents ?? null;
            const uFrameworks = uSettings?.enabledFrameworks ?? null;
            const uFeatures = uSettings?.enabledFeatures ?? null;
            const hasCustomConfig = uAgents !== null || uFrameworks !== null || uFeatures !== null;
            return (
              <div key={u._id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {u.picture ? (
                      <img src={u.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-sky/20 flex items-center justify-center text-sm text-sky-light font-medium">
                        {(u.name || u.email)[0]}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-white">{u.name || u.email}</div>
                      <div className="text-xs text-white/70">{u.email}</div>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto flex flex-col sm:items-end gap-2">
                    <select
                      value={u.role}
                      onChange={(e) => setRole({ targetUserId: u._id, role: e.target.value })}
                      className="w-full sm:w-auto bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-light/50"
                    >
                      <option value="user">User</option>
                      <option value="aerogap_employee">AeroGap Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                    {(() => {
                      const settings = userSettingsByClerkId.get(u.clerkUserId);
                      const logbookEnabled = settings?.logbookEnabled === true;
                      const entitlementMode = settings?.logbookEntitlementMode === 'standalone' ? 'standalone' : 'addon';
                      return (
                        <div className="flex items-center gap-2">
                          <select
                            value={logbookEnabled ? 'enabled' : 'disabled'}
                            onChange={async (e) => {
                              const nextEnabled = e.target.value === 'enabled';
                              try {
                                await setLogbookEntitlement({ targetUserId: u._id, logbookEnabled: nextEnabled, logbookEntitlementMode: nextEnabled ? entitlementMode : undefined } as any);
                                toast.success(`Logbook ${nextEnabled ? 'enabled' : 'disabled'} for ${u.name || u.email}`);
                              } catch (err: any) {
                                toast.error(err?.message || 'Failed to update logbook access');
                              }
                            }}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-light/50"
                            aria-label={`Logbook access for ${u.name || u.email}`}
                          >
                            <option value="enabled">Logbook: Enabled</option>
                            <option value="disabled">Logbook: Disabled</option>
                          </select>
                          <select
                            value={entitlementMode}
                            disabled={!logbookEnabled}
                            onChange={async (e) => {
                              try {
                                await setLogbookEntitlement({ targetUserId: u._id, logbookEnabled: true, logbookEntitlementMode: e.target.value } as any);
                                toast.success(`Updated Logbook mode for ${u.name || u.email}`);
                              } catch (err: any) {
                                toast.error(err?.message || 'Failed to update logbook mode');
                              }
                            }}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-light/50 disabled:opacity-50"
                          >
                            <option value="addon">Add-on</option>
                            <option value="standalone">Standalone</option>
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${uAgents === null ? 'bg-green-500/10 text-green-400' : 'bg-violet-500/15 text-violet-300'}`}>
                    {uAgents === null ? 'All agents' : `${uAgents.length} agents`}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${uFrameworks === null ? 'bg-green-500/10 text-green-400' : 'bg-violet-500/15 text-violet-300'}`}>
                    {uFrameworks === null ? 'All frameworks' : `${uFrameworks.length} frameworks`}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${uFeatures === null ? 'bg-green-500/10 text-green-400' : 'bg-violet-500/15 text-violet-300'}`}>
                    {uFeatures === null ? 'All features' : `${uFeatures.length} features`}
                  </span>
                  {hasCustomConfig && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300">Custom</span>
                  )}
                  <button
                    onClick={() => onConfigureUser(u._id)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors border border-violet-500/20"
                  >
                    <FiSliders className="w-3 h-3" />
                    Configure
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
