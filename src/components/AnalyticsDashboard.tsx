import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { useAppStore } from '../store/appStore';
import { useProjectStats, useComplianceTrend, useCrossProjectSummary } from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard } from './ui';

// Color palette aligned with app theme
const SEVERITY_COLORS = {
  critical: '#f87171',   // red-400
  major: '#fbbf24',      // amber-400
  minor: '#facc15',      // yellow-400
  observation: '#94a3b8', // slate-400
};

const STATUS_COLORS = {
  open: '#f87171',
  in_progress: '#fb923c',
  pending_verification: '#60a5fa',
  closed: '#4ade80',
  voided: '#475569',
};

const SOURCE_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#f472b6'];

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#f1f5f9',
  fontSize: '12px',
};

function KPICard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-5 ${color}`}>
      <div className="text-3xl font-bold font-display text-white mb-1">{value}</div>
      <div className="text-sm font-medium text-white/80">{label}</div>
      {sub && <div className="text-xs text-white/50 mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-white/40 text-sm">{message}</div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">{children}</h2>
  );
}

export default function AnalyticsDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const stats = useProjectStats(activeProjectId ?? undefined) as any;
  const complianceTrend = (useComplianceTrend(activeProjectId ?? undefined) as any[]) ?? [];
  const crossProject = useCrossProjectSummary() as any;

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to view analytics.</p>
          <Button onClick={() => navigate('/projects')}>Go to Projects</Button>
        </GlassCard>
      </div>
    );
  }

  const severityData = stats ? [
    { name: 'Critical', value: stats.severityBreakdown.critical, color: SEVERITY_COLORS.critical },
    { name: 'Major', value: stats.severityBreakdown.major, color: SEVERITY_COLORS.major },
    { name: 'Minor', value: stats.severityBreakdown.minor, color: SEVERITY_COLORS.minor },
    { name: 'Observation', value: stats.severityBreakdown.observation, color: SEVERITY_COLORS.observation },
  ].filter((d) => d.value > 0) : [];

  const statusData = stats ? [
    { name: 'Open', value: stats.statusBreakdown.open, color: STATUS_COLORS.open },
    { name: 'In Progress', value: stats.statusBreakdown.in_progress, color: STATUS_COLORS.in_progress },
    { name: 'Pending Verification', value: stats.statusBreakdown.pending_verification, color: STATUS_COLORS.pending_verification },
    { name: 'Closed', value: stats.statusBreakdown.closed, color: STATUS_COLORS.closed },
    { name: 'Voided', value: stats.statusBreakdown.voided, color: STATUS_COLORS.voided },
  ].filter((d) => d.value > 0) : [];

  const sourceData = stats ? [
    { name: 'Audit Sim', value: stats.sourceBreakdown.audit_sim },
    { name: 'Paperwork Review', value: stats.sourceBreakdown.paperwork_review },
    { name: 'Analysis', value: stats.sourceBreakdown.analysis },
    { name: 'Manual', value: stats.sourceBreakdown.manual },
  ].filter((d) => d.value > 0) : [];

  const isLoading = stats === undefined;

  return (
    <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Analytics
        </h1>
        <p className="text-white/60 text-lg">
          Compliance trends, CAR lifecycle, and finding patterns for this project.
        </p>
      </div>

      {/* Cross-project global KPIs */}
      {crossProject && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <KPICard
            label="Open CARs (all projects)"
            value={crossProject.totalOpen ?? 0}
            color="bg-red-500/10 border border-red-500/20"
          />
          <KPICard
            label="Overdue CARs"
            value={crossProject.totalOverdue ?? 0}
            color="bg-orange-500/10 border border-orange-500/20"
          />
          <KPICard
            label="Closed this month"
            value={crossProject.closedThisMonth ?? 0}
            color="bg-green-500/10 border border-green-500/20"
          />
          <KPICard
            label="Avg compliance"
            value={crossProject.avgComplianceScore != null ? `${crossProject.avgComplianceScore}%` : '—'}
            sub={`across ${crossProject.projectCount ?? 0} projects`}
            color="bg-sky/10 border border-sky/20"
          />
        </div>
      )}

      {/* Project KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <KPICard
            label="Total Findings"
            value={stats.totalIssues}
            color="bg-white/5 border border-white/10"
          />
          <KPICard
            label="Overdue"
            value={stats.overdueCount}
            color={stats.overdueCount > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5 border border-white/10'}
          />
          <KPICard
            label="Avg Days to Close"
            value={stats.avgDaysToClose != null ? stats.avgDaysToClose : '—'}
            sub="closed CARs only"
            color="bg-white/5 border border-white/10"
          />
          <KPICard
            label="Closed CARs"
            value={stats.statusBreakdown?.closed ?? 0}
            color="bg-green-500/10 border border-green-500/20"
          />
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-white/50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-sky animate-spin" />
            <span className="text-sm">Loading analytics…</span>
          </div>
        </div>
      )}

      {stats && stats.totalIssues === 0 && (
        <GlassCard className="text-center py-12">
          <p className="text-white/50">No findings yet for this project. Run an audit simulation, paperwork review, or analysis to generate findings.</p>
        </GlassCard>
      )}

      {stats && stats.totalIssues > 0 && (
        <div className="space-y-6">
          {/* Row 1: Severity donut + CAR Status donut */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GlassCard>
              <SectionTitle>Severity Breakdown</SectionTitle>
              {severityData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={severityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {severityData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend
                      formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No findings" />
              )}
            </GlassCard>

            <GlassCard>
              <SectionTitle>CAR Status Distribution</SectionTitle>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend
                      formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No data" />
              )}
            </GlassCard>
          </div>

          {/* Row 2: Monthly trend bar chart */}
          <GlassCard>
            <SectionTitle>Findings Created (Last 12 Months)</SectionTitle>
            {stats.monthlyTrend?.some((d: any) => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.monthlyTrend} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="count" fill="#38bdf8" radius={[3, 3, 0, 0]} name="Findings" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No findings in the last 12 months" />
            )}
          </GlassCard>

          {/* Row 3: Compliance trend line chart */}
          {complianceTrend.length > 0 && (
            <GlassCard>
              <SectionTitle>Compliance Score Trend</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={complianceTrend} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value) => [`${value}%`, 'Compliance']}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#4ade80"
                    strokeWidth={2}
                    dot={{ fill: '#4ade80', r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            </GlassCard>
          )}

          {/* Row 4: Source breakdown + Top regulation refs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GlassCard>
              <SectionTitle>Findings by Source</SectionTitle>
              {sourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {sourceData.map((_entry, index) => (
                        <Cell key={index} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend
                      formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No source data" />
              )}
            </GlassCard>

            <GlassCard>
              <SectionTitle>Top Regulation References</SectionTitle>
              {stats.topRegRefs?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    layout="vertical"
                    data={stats.topRegRefs}
                    margin={{ top: 4, right: 8, bottom: 4, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="ref"
                      width={80}
                      tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="count" fill="#818cf8" radius={[0, 3, 3, 0]} name="Findings" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No regulation references found" />
              )}
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
