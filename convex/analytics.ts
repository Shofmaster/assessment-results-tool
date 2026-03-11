import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireProjectOwner } from "./_helpers";

/** Aggregate statistics for a single project's entity issues. */
export const getProjectStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);

    const issues = await ctx.db
      .query("entityIssues")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const now = new Date();

    // Severity breakdown
    const severityBreakdown = { critical: 0, major: 0, minor: 0, observation: 0 };
    for (const issue of issues) {
      severityBreakdown[issue.severity as keyof typeof severityBreakdown]++;
    }

    // Status breakdown
    const statusBreakdown = { open: 0, in_progress: 0, pending_verification: 0, closed: 0, voided: 0 };
    for (const issue of issues) {
      const s = (issue.status ?? "open") as keyof typeof statusBreakdown;
      statusBreakdown[s]++;
    }

    // Source breakdown
    const sourceBreakdown = { audit_sim: 0, paperwork_review: 0, analysis: 0, manual: 0 };
    for (const issue of issues) {
      const src = issue.source as keyof typeof sourceBreakdown;
      if (src in sourceBreakdown) sourceBreakdown[src]++;
    }

    // Overdue count (has dueDate, not closed/voided, past due)
    const overdueCount = issues.filter((i) => {
      if (!i.dueDate) return false;
      const s = i.status ?? "open";
      if (s === "closed" || s === "voided") return false;
      return new Date(i.dueDate) < now;
    }).length;

    // Average days to close (closed issues only)
    const closedIssues = issues.filter((i) => i.status === "closed" && i.closedAt);
    let avgDaysToClose: number | null = null;
    if (closedIssues.length > 0) {
      const totalDays = closedIssues.reduce((sum, i) => {
        const created = new Date(i.createdAt).getTime();
        const closed = new Date(i.closedAt!).getTime();
        return sum + (closed - created) / (1000 * 60 * 60 * 24);
      }, 0);
      avgDaysToClose = Math.round(totalDays / closedIssues.length);
    }

    // Monthly trend: issues created per month (last 12 months)
    const monthlyTrend: { month: string; count: number }[] = [];
    for (let m = 11; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const count = issues.filter((i) => {
        const created = new Date(i.createdAt);
        return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
      }).length;
      monthlyTrend.push({ month: label, count });
    }

    // Top regulation references (group by §section prefix)
    const regRefCounts: Record<string, number> = {};
    for (const issue of issues) {
      if (!issue.regulationRef) continue;
      // Group by first "word" token (e.g. "14 CFR §145.109" → "§145.109")
      const tokens = issue.regulationRef.split(/\s+/);
      const key = tokens.find((t) => t.startsWith("§")) ?? tokens[0] ?? issue.regulationRef;
      regRefCounts[key] = (regRefCounts[key] ?? 0) + 1;
    }
    const topRegRefs = Object.entries(regRefCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ref, count]) => ({ ref, count }));

    return {
      totalIssues: issues.length,
      severityBreakdown,
      statusBreakdown,
      sourceBreakdown,
      overdueCount,
      avgDaysToClose,
      monthlyTrend,
      topRegRefs,
    };
  },
});

/** Compliance score trend for a project (one data point per analysis run). */
export const getComplianceTrend = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);

    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    return analyses
      .filter((a) => a.compliance?.overall != null)
      .sort((a, b) => a.analysisDate.localeCompare(b.analysisDate))
      .map((a) => ({
        date: new Date(a.analysisDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: Math.round(a.compliance.overall),
        companyName: a.companyName,
      }));
  },
});

/** Cross-project summary for the authenticated user. */
export const getCrossProjectSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let totalOpen = 0;
    let totalOverdue = 0;
    let closedThisMonth = 0;
    let complianceSum = 0;
    let complianceCount = 0;

    for (const project of projects) {
      const issues = await ctx.db
        .query("entityIssues")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();

      for (const issue of issues) {
        const s = issue.status ?? "open";
        if (s === "open" || s === "in_progress" || s === "pending_verification") totalOpen++;
        if (s === "closed" && issue.closedAt && issue.closedAt >= startOfMonth) closedThisMonth++;
        if (issue.dueDate && s !== "closed" && s !== "voided" && new Date(issue.dueDate) < now) totalOverdue++;
      }

      const analyses = await ctx.db
        .query("analyses")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();

      for (const analysis of analyses) {
        if (analysis.compliance?.overall != null) {
          complianceSum += analysis.compliance.overall;
          complianceCount++;
        }
      }
    }

    return {
      projectCount: projects.length,
      totalOpen,
      totalOverdue,
      closedThisMonth,
      avgComplianceScore: complianceCount > 0 ? Math.round(complianceSum / complianceCount) : null,
    };
  },
});
