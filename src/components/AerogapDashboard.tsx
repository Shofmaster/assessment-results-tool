import { useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiUsers, FiBook, FiClock, FiCheck, FiChevronDown, FiChevronUp,
  FiMail, FiArrowRight, FiAlertCircle, FiSearch, FiTrendingUp,
} from 'react-icons/fi';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { GlassCard, Badge } from './ui';
import { useQuery } from '../hooks/useConvexQueryNoThrow';
import { api } from '../../convex/_generated/api';
import { useIsAerogapEmployee } from '../hooks/useConvexData';
import { useTheme } from '../context/ThemeContext';

const MANUAL_TYPE_LABELS: Record<string, string> = {
  'part-145-manual': 'Part 145',
  'gmm': 'GMM',
  'qcm': 'QCM',
  'training-program': 'Training',
  'part-135-manual': 'Part 135',
  'sms-manual': 'SMS',
  'ops-specs': 'Ops Specs',
  'ipm': 'IPM',
  'hazmat-manual': 'Hazmat',
  'tool-calibration': 'Tool Cal',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-white/50',
  in_review: 'text-amber-400',
  approved: 'text-green-400',
  published: 'text-sky-400',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function StatusDot({ status }: { status: string }) {
  const color = {
    draft: 'bg-white/30',
    in_review: 'bg-amber-400',
    approved: 'bg-green-400',
    published: 'bg-sky-400',
  }[status] || 'bg-white/20';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

// Inline expanded row showing a user's manuals
function UserManualsExpand({ userId, onNavigate, isDarkMode }: { userId: string; onNavigate: (uid: string) => void; isDarkMode: boolean }) {
  const allManuals = useQuery((api as any).manuals.listAllForEmployee) as any[] | undefined;
  const userManuals = (allManuals || []).filter((m: any) => m.userId === userId);

  if (!allManuals) {
    return <div className={`text-xs p-4 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Loading…</div>;
  }

  if (userManuals.length === 0) {
    return <div className={`text-xs p-4 italic ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>No manuals for this user.</div>;
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className={`${isDarkMode ? 'text-white/40 border-white/10' : 'text-slate-500 border-slate-200'} border-b`}>
              <th className="text-left py-1.5 pr-4 font-medium">Title</th>
              <th className="text-left py-1.5 pr-4 font-medium">Type</th>
              <th className="text-left py-1.5 pr-4 font-medium">Revision</th>
              <th className="text-left py-1.5 pr-4 font-medium">Status</th>
              <th className="text-left py-1.5 font-medium">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {userManuals.map((m: any) => (
              <tr key={m._id} className={`border-b ${isDarkMode ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}>
                <td className={`py-1.5 pr-4 font-medium max-w-[200px] truncate ${isDarkMode ? 'text-white/80' : 'text-slate-800'}`}>{m.title}</td>
                <td className={`py-1.5 pr-4 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
                  {MANUAL_TYPE_LABELS[m.manualType] || m.manualType}
                </td>
                <td className={`py-1.5 pr-4 font-mono ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>{m.currentRevision}</td>
                <td className="py-1.5 pr-4">
                  <span className={`flex items-center gap-1.5 ${STATUS_COLORS[m.status] || 'text-white/50'}`}>
                    <StatusDot status={m.status} />
                    {m.status.replace('_', ' ')}
                  </span>
                </td>
                <td className={`py-1.5 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>{formatDate(m.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onNavigate(userId)}
        className={`mt-3 flex items-center gap-1.5 text-xs transition-colors ${
          isDarkMode ? 'text-sky-lighter/70 hover:text-sky-lighter' : 'text-sky-700/80 hover:text-sky-700'
        }`}
      >
        Manage manuals <FiArrowRight className="text-xs" />
      </button>
    </div>
  );
}

// User row in the table
function UserRow({
  user, onNavigate, isDarkMode,
}: { user: any; onNavigate: (uid: string) => void; isDarkMode: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const worstStatus = (() => {
    if (user.statusCounts.in_review > 0) return 'in_review';
    if (user.statusCounts.draft > 0) return 'draft';
    if (user.statusCounts.approved > 0) return 'approved';
    if (user.statusCounts.published > 0) return 'published';
    return null;
  })();

  return (
    <>
      <tr
        className={`border-b cursor-pointer transition-colors ${
          isDarkMode
            ? `border-white/5 ${expanded ? 'bg-white/5' : 'hover:bg-white/3'}`
            : `border-slate-100 ${expanded ? 'bg-slate-50' : 'hover:bg-slate-50/80'}`
        }`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-3">
            {user.picture ? (
              <img src={user.picture} alt="" className="w-8 h-8 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-sky/20 flex items-center justify-center text-sm text-sky-light font-medium flex-shrink-0">
                {(user.name || user.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{user.name || 'No name'}</div>
              <div className={`text-xs flex items-center gap-1 truncate ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>
                <FiMail className="text-[10px] flex-shrink-0" />
                {user.email}
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 px-4 text-center">
          {user.manualCount > 0 ? (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sky/20 text-sky-lighter font-bold text-sm">
              {user.manualCount}
            </span>
          ) : (
            <span className={`text-sm ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`}>0</span>
          )}
        </td>
        <td className="py-3 px-4">
          <div className="flex flex-wrap gap-1.5">
            {user.statusCounts.in_review > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs">
                <FiClock className="text-[10px]" />
                {user.statusCounts.in_review} review
              </span>
            )}
            {user.statusCounts.approved > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs">
                <FiCheck className="text-[10px]" />
                {user.statusCounts.approved} approved
              </span>
            )}
            {user.statusCounts.draft > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-xs">
                {user.statusCounts.draft} draft
              </span>
            )}
            {user.manualCount === 0 && (
              <span className={`text-xs italic ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`}>No manuals</span>
            )}
          </div>
        </td>
        <td className={`py-3 px-4 text-xs ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>{formatDate(user.lastActivity)}</td>
        <td className="py-3 px-4 text-right">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate(user.clerkUserId); }}
            className={`p-1.5 transition-colors ${isDarkMode ? 'text-white/40 hover:text-sky-lighter' : 'text-slate-500 hover:text-sky-700'}`}
            title="View manuals"
          >
            <FiArrowRight className="text-[15px]" />
          </button>
          <span className={`ml-1 ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`}>
            {expanded ? <FiChevronUp className="inline text-[15px]" /> : <FiChevronDown className="inline text-[15px]" />}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className={`${isDarkMode ? 'bg-white/3 border-white/10' : 'bg-slate-50 border-slate-200'} border-b`}>
            <UserManualsExpand userId={user.clerkUserId} onNavigate={onNavigate} isDarkMode={isDarkMode} />
          </td>
        </tr>
      )}
    </>
  );
}

type SortKey = 'name' | 'manualCount' | 'lastActivity' | 'pending';
type SortDir = 'asc' | 'desc';

export default function AerogapDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const isAerogapEmp = useIsAerogapEmployee();

  const userStats = useQuery((api as any).manuals.listUsersWithManualStats) as any[] | undefined;
  const allManuals = useQuery((api as any).manuals.listAllForEmployee) as any[] | undefined;

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastActivity');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const handleNavigateToUser = (userId: string) => {
    navigate('/manual-management');
  };

  const filtered = useMemo(() => {
    if (!userStats) return [];
    let rows = userStats.filter((u: any) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    });
    rows = [...rows].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'name') { av = (a.name || a.email || '').toLowerCase(); bv = (b.name || b.email || '').toLowerCase(); }
      else if (sortKey === 'manualCount') { av = a.manualCount; bv = b.manualCount; }
      else if (sortKey === 'lastActivity') { av = a.lastActivity || ''; bv = b.lastActivity || ''; }
      else if (sortKey === 'pending') { av = a.statusCounts.in_review; bv = b.statusCounts.in_review; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [userStats, search, sortKey, sortDir]);

  // Summary stats
  const totalUsers = filtered.length;
  const totalManuals = allManuals?.length || 0;
  const pendingReview = (allManuals || []).filter((m: any) => m.status === 'in_review').length;
  const approvedTotal = (allManuals || []).filter((m: any) => m.status === 'approved' || m.status === 'published').length;

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === 'asc'
        ? <FiChevronUp className={`inline text-xs ml-0.5 ${isDarkMode ? 'text-sky-lighter' : 'text-sky-700'}`} />
        : <FiChevronDown className={`inline text-xs ml-0.5 ${isDarkMode ? 'text-sky-lighter' : 'text-sky-700'}`} />
    ) : null;

  if (!isAerogapEmp) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FiAlertCircle className="text-red-400 text-4xl mb-3" />
        <p className={isDarkMode ? 'text-white/60' : 'text-slate-600'}>You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full min-w-0 p-4 sm:p-6 lg:p-8 space-y-7 h-full min-h-0">
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-display font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>AeroGap Employee Dashboard</h1>
        <p className={`text-sm mt-1 ${isDarkMode ? 'text-white/50' : 'text-slate-600'}`}>
          Overview of all customer manuals, statuses, and pending actions.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard border padding="sm" className="flex flex-col gap-1">
          <div className={`flex items-center gap-2 text-xs ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>
            <FiUsers className="text-sky-lighter" /> Customers
          </div>
          <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            {userStats ? totalUsers : <span className={isDarkMode ? 'text-white/20' : 'text-slate-300'}>—</span>}
          </div>
        </GlassCard>
        <GlassCard border padding="sm" className="flex flex-col gap-1">
          <div className={`flex items-center gap-2 text-xs ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>
            <FiBook className="text-sky-lighter" /> Total Manuals
          </div>
          <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            {allManuals ? totalManuals : <span className={isDarkMode ? 'text-white/20' : 'text-slate-300'}>—</span>}
          </div>
        </GlassCard>
        <GlassCard border padding="sm" className="flex flex-col gap-1">
          <div className={`flex items-center gap-2 text-xs ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>
            <FiClock className="text-amber-400" /> Pending Review
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {allManuals ? pendingReview : <span className={isDarkMode ? 'text-white/20' : 'text-slate-300'}>—</span>}
          </div>
        </GlassCard>
        <GlassCard border padding="sm" className="flex flex-col gap-1">
          <div className={`flex items-center gap-2 text-xs ${isDarkMode ? 'text-white/50' : 'text-slate-500'}`}>
            <FiCheck className="text-green-400" /> Approved
          </div>
          <div className="text-2xl font-bold text-green-400">
            {allManuals ? approvedTotal : <span className={isDarkMode ? 'text-white/20' : 'text-slate-300'}>—</span>}
          </div>
        </GlassCard>
      </div>

      {/* Search */}
      <div className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl w-full max-w-md ${
        isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm shadow-slate-300/20'
      }`}>
        <FiSearch className={`flex-shrink-0 ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customers…"
          className={`flex-1 bg-transparent text-sm focus:outline-none ${
            isDarkMode ? 'text-white placeholder-white/30' : 'text-slate-900 placeholder-slate-400'
          }`}
        />
      </div>

      {/* User table */}
      <GlassCard border padding="none" className="overflow-hidden">
        {!userStats ? (
          <div className={`p-8 text-center text-sm ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className={`p-8 text-center text-sm ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
            {search ? 'No customers match the search.' : 'No customers yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                <tr className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                  <th
                    className={`text-left py-3 px-4 font-semibold cursor-pointer transition-colors select-none ${
                      isDarkMode ? 'hover:text-white/70' : 'hover:text-slate-800'
                    }`}
                    onClick={() => handleSort('name')}
                  >
                    Customer <SortIcon k="name" />
                  </th>
                  <th
                    className={`text-center py-3 px-4 font-semibold cursor-pointer transition-colors select-none ${
                      isDarkMode ? 'hover:text-white/70' : 'hover:text-slate-800'
                    }`}
                    onClick={() => handleSort('manualCount')}
                  >
                    Manuals <SortIcon k="manualCount" />
                  </th>
                  <th className="text-left py-3 px-4 font-semibold">
                    Status Breakdown
                  </th>
                  <th
                    className={`text-left py-3 px-4 font-semibold cursor-pointer transition-colors select-none ${
                      isDarkMode ? 'hover:text-white/70' : 'hover:text-slate-800'
                    }`}
                    onClick={() => handleSort('lastActivity')}
                  >
                    Last Activity <SortIcon k="lastActivity" />
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((user: any) => (
                  <UserRow key={user._id} user={user} onNavigate={handleNavigateToUser} isDarkMode={isDarkMode} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Legend */}
      <div className={`flex flex-wrap gap-4 pt-1 text-xs ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
        <span className="flex items-center gap-1.5"><StatusDot status="draft" /> Draft</span>
        <span className="flex items-center gap-1.5"><StatusDot status="in_review" /> In Review</span>
        <span className="flex items-center gap-1.5"><StatusDot status="approved" /> Approved</span>
        <span className="flex items-center gap-1.5"><StatusDot status="published" /> Published</span>
      </div>
    </div>
  );
}
