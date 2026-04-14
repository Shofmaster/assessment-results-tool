import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCompanySummariesForStaff, useUpsertUserSettings } from '../hooks/useConvexData';

export default function CompanyBrowser() {
  const summaries = useCompanySummariesForStaff();
  const upsert = useUpsertUserSettings();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const list = (summaries || []) as any[];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(needle) ||
        (c.slug || '').toLowerCase().includes(needle),
    );
  }, [summaries, q]);

  const setScope = async (companyId: string, name?: string) => {
    try {
      await upsert({ activeCompanyId: companyId as any });
      toast.success(name ? `Sidebar scope: ${name}` : 'Company scope updated');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update company scope');
      throw err;
    }
  };

  const openInSidebar = async (companyId: string, name?: string) => {
    try {
      await upsert({ activeCompanyId: companyId as any });
      toast.success(name ? `Opened workspace: ${name}` : 'Workspace scope updated');
      navigate('/splash');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not open company');
    }
  };

  if (summaries === undefined) {
    return (
      <div className="p-8 text-white/70 text-sm">Loading companies...</div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">Companies</h1>
          <p className="text-sm text-white/65 mt-1">
            Search tenants, set your sidebar scope, or open a company in the main workspace.
          </p>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or slug..."
          className="w-full max-w-md px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/40 focus:outline-none focus:border-sky-light/50"
        />
        <div className="rounded-xl border border-white/10 overflow-hidden bg-navy-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-white/80 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Slug</th>
                  <th className="px-4 py-3 font-semibold text-right">Members</th>
                  <th className="px-4 py-3 font-semibold text-right">Projects</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any) => (
                  <tr
                    key={c._id}
                    className="border-t border-white/10 text-white/90 hover:bg-white/[0.04] cursor-pointer"
                    onClick={() => setScope(c._id, c.name).catch(() => {})}
                    title="Click row to set sidebar scope"
                  >
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-white/60">{c.slug ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.memberCount ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.projectCount ?? 0}</td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setScope(c._id, c.name).catch(() => {});
                        }}
                        className="px-3 py-1.5 rounded-lg border border-sky-light/40 bg-sky/15 text-sky-lighter text-xs font-medium hover:bg-sky/25"
                      >
                        Set scope
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/companies/${c._id}/projects`);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-amber-400/35 text-amber-100 text-xs font-medium hover:bg-amber-500/15"
                      >
                        Projects
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openInSidebar(c._id, c.name);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-white/20 text-white/85 text-xs font-medium hover:bg-white/10"
                      >
                        Open in sidebar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="px-4 py-8 text-center text-white/55 text-sm">No companies match your search.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
