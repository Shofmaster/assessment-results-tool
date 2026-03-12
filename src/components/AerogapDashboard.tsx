import { useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiUsers, FiBook, FiClock, FiCheck, FiChevronDown, FiChevronUp,
  FiMail, FiArrowRight, FiAlertCircle, FiSearch, FiTrendingUp,
} from 'react-icons/fi';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { GlassCard, Badge } from './ui';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useIsAerogapEmployee } from '../hooks/useConvexData';

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
function UserManualsExpand({ userId, onNavigate }: { userId: string; onNavigate: (uid: string) => void }) {
  const allManuals = useQuery((api as any).manuals.listAllForEmployee) as any[] | undefined;
  const userManuals = (allManuals || []).filter((m: any) => m.userId === userId);

  if (!allManuals) {
    return <div className="text-white/40 text-xs p-4">Loading…</div>;
  }

  if (userManuals.length === 0) {
    return <div className="text-white/40 text-xs p-4 italic">No manuals for this user.</div>;
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/40 border-b border-white/10">
              <th className="text-left py-1.5 pr-4 font-medium">Title</th>
              <th className="text-left py-1.5 pr-4 font-medium">Type</th>
              <th className="text-left py-1.5 pr-4 font-medium">Revision</th>
              <th className="text-left py-1.5 pr-4 font-medium">Status</th>
              <th className="text-left py-1.5 font-medium">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {userManuals.map((m: any) => (
              <tr key={m._id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-1.5 pr-4 text-white/80 font-medium max-w-[200px] truncate">{m.title}</td>
                <td className="py-1.5 pr-4 text-white/60">
                  {MANUAL_TYPE_LABELS[m.manualType] || m.manualType}
                </td>
                <td className="py-1.5 pr-4 text-white/50 font-mono">{m.currentRevision}</td>
                <td className="py-1.5 pr-4">
                  <span className={`flex items-center gap-1.5 ${STATUS_COLORS[m.status] || 'text-white/50'}`}>
                    <StatusDot status={m.status} />
                    {m.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-1.5 text-white/40">{formatDate(m.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onNavigate(userId)}
        className="mt-3 flex items-center gap-1.5 text-xs text-sky-lighter/70 hover:text-sky-lighter transition-colors"
      >
        Manage manuals <FiArrowRight className="text-xs" />
      </button>
    </div>
  );
}

// User row in the table
function UserRow({
  user, onNavigate,
}: { user: any; onNavigate: (uid: string) => void }) {
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
        className={`border-b border-white/5 cursor-pointer transition-colors ${expanded ? 'bg-white/5' : 'hover:bg-white/3'}`}
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
              <div className="text-sm font-medium text-white truncate">{user.name || 'No name'}</div>
              <div className="text-xs text-white/50 flex items-center gap-1 truncate">
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
            <span className="text-white/30 text-sm">0</span>
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
              <span className="text-white/30 text-xs italic">No manuals</span>
            )}
          </div>
        </td>
        <td className="py-3 px-4 text-white/40 text-xs">{formatDate(user.lastActivity)}</td>
        <td className="py-3 px-4 text-right">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate(user.clerkUserId); }}
            className="p-1.5 text-white/40 hover:text-sky-lighter transition-colors"
            title="View manuals"
          >
            <FiArrowRight className="text-sm" />
          </button>
          <span className="ml-1 text-white/30">
            {expanded ? <FiChevronUp className="inline text-sm" /> : <FiChevronDown className="inline text-sm" />}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-white/3 border-b border-white/10">
            <UserManualsExpand userId={user.clerkUserId} onNavigate={onNavigate} />
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
      sortDir === 'asc' ? <FiChevronUp className="inline text-xs ml-0.5 text-sky-lighter" /> : <FiChevronDown className="inline text-xs ml-0.5 text-sky-lighter" />
    ) : null;

  if (!isAerogapEmp) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FiAlertCircle className="text-red-400 text-4xl mb-3" />
        <p className="text-white/60">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-white">AeroGap Employee Dashboard</h1>
        <p className="text-white/50 text-sm mt-1">
          Overview of all customer manuals, statuses, and pending actions.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlassCard border padding="sm" className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <FiUsers className="text-sky-lighter" /> Customers
          </div>
          <div className="text-2xl font-bold text-white">
            {userStats ? totalUsers : <span className="text-white/20">—</span>}
          </div>
        </GlassCard>
        <GlassCard border padding="sm" className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <FiBook className="text-sky-lighter" /> Total Manuals
          </div>
          <div className="text-2xl font-bold text-white">
            {allManuals ? totalManuals : <span className="text-white/20">—</span>}
          </div>
        </GlassCard>
        <GlassCard border padding="sm" className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <FiClock className="text-amber-400" /> Pending Review
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {allManuals ? pendingReview : <span className="text-white/20">—</span>}
          </div>
        </GlassCard>
        <GlassCard border padding="sm" className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <FiCheck className="text-green-400" /> Approved
          </div>
          <div className="text-2xl font-bold text-green-400">
            {allManuals ? approvedTotal : <span className="text-white/20">—</span>}
          </div>
        </GlassCard>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl w-full max-w-sm">
        <FiSearch className="text-white/30 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customers…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
        />
      </div>

      {/* User table */}
      <GlassCard border padding="none" className="overflow-hidden">
        {!userStats ? (
          <div className="p-8 text-center text-white/40 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-white/40 text-sm">
            {search ? 'No customers match the search.' : 'No customers yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr className="text-white/40 text-xs">
                  <th
                    className="text-left py-3 px-4 font-semibold cursor-pointer hover:text-white/70 transition-colors select-none"
                    onClick={() => handleSort('name')}
                  >
                    Customer <SortIcon k="name" />
                  </th>
                  <th
                    className="text-center py-3 px-4 font-semibold cursor-pointer hover:text-white/70 transition-colors select-none"
                    onClick={() => handleSort('manualCount')}
                  >
                    Manuals <SortIcon k="manualCount" />
                  </th>
                  <th className="text-left py-3 px-4 font-semibold">
                    Status Breakdown
                  </th>
                  <th
                    className="text-left py-3 px-4 font-semibold cursor-pointer hover:text-white/70 transition-colors select-none"
                    onClick={() => handleSort('lastActivity')}
                  >
                    Last Activity <SortIcon k="lastActivity" />
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((user: any) => (
                  <UserRow key={user._id} user={user} onNavigate={handleNavigateToUser} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-white/40">
        <span className="flex items-center gap-1.5"><StatusDot status="draft" /> Draft</span>
        <span className="flex items-center gap-1.5"><StatusDot status="in_review" /> In Review</span>
        <span className="flex items-center gap-1.5"><StatusDot status="approved" /> Approved</span>
        <span className="flex items-center gap-1.5"><StatusDot status="published" /> Published</span>
      </div>
    </div>
  );
}
