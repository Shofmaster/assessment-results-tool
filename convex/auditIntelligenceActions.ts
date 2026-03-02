import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

const AGENT_ID = "audit-intelligence-analyst";
const MAX_OUTPUT_TOKENS = 2048;

type EntityIssue = {
  severity: "critical" | "major" | "minor" | "observation";
  title: string;
  description: string;
  regulationRef?: string;
  source: string;
};

type PatternGroup = {
  count: number;
  critical: number;
  major: number;
  minor: number;
  observation: number;
  titles: string[];
};

/** Aggregate raw issues into a compact summary for the synthesis prompt. */
function aggregateIssues(issues: EntityIssue[]): string {
  if (issues.length === 0) return "No issues recorded yet.";

  // Group by regulationRef (falling back to title keyword bucket)
  const byRef: Record<string, PatternGroup> = {};

  for (const issue of issues) {
    const key = issue.regulationRef?.trim() || "Unclassified";
    if (!byRef[key]) {
      byRef[key] = { count: 0, critical: 0, major: 0, minor: 0, observation: 0, titles: [] };
    }
    byRef[key].count++;
    byRef[key][issue.severity]++;
    if (!byRef[key].titles.includes(issue.title)) {
      byRef[key].titles.push(issue.title);
    }
  }

  // Sort by total count descending, take top 30 patterns
  const sorted = Object.entries(byRef)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 30);

  const lines = sorted.map(([ref, data]) => {
    const severityBreakdown = [
      data.critical > 0 ? `${data.critical} critical` : null,
      data.major > 0 ? `${data.major} major` : null,
      data.minor > 0 ? `${data.minor} minor` : null,
      data.observation > 0 ? `${data.observation} observation` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const sampleTitles = data.titles.slice(0, 3).join("; ");
    return `- ${ref}: ${data.count} occurrences (${severityBreakdown}) — examples: ${sampleTitles}`;
  });

  return lines.join("\n");
}

function buildSynthesisPrompt(issueSummary: string, totalCount: number): string {
  return `You are updating the institutional memory of an AI aviation audit agent called the "Audit Intelligence Analyst." This agent participates in audit simulations to surface historical patterns and flag known problem areas to other auditors.

Your task: Write a structured memory document (~600-800 words) that the Audit Intelligence Analyst will use as its primary knowledge base. The document must:
1. Be written in pattern-based, observational language — not as regulatory requirements
2. Group findings into thematic sections (e.g. Training Records, Calibration, Quality Control, Documentation, SMS)
3. For each section, include: frequency signal, typical severity, key diagnostic signals, and 1-2 probe questions
4. End with a brief "Cross-cutting observations" section noting any meta-patterns (e.g. orgs that self-report no problems tend to have more issues)
5. Be actionable for an AI agent that needs to know WHAT to probe for and WHEN to press harder

The following data represents ${totalCount} findings aggregated across all audits in the system, grouped by regulation reference with severity counts:

${issueSummary}

Format the output as plain text (no markdown headers with #, use ALL-CAPS section names instead). The tone should be that of a seasoned analyst briefing a colleague — not a compliance checklist. Do not cite regulations as requirements; describe what has actually been observed. This document will be injected directly into an AI agent's context window.`;
}

/** Callable from the Admin KB panel UI button. Requires an authenticated user session. */
export const synthesizePatterns = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; issueCount: number; message: string }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set in Convex environment. Run: npx convex env set ANTHROPIC_API_KEY=sk-ant-...");
    }

    // Fetch all issues cross-project via internal query
    const issues = await ctx.runQuery(internal.entityIssues.listAllInternal, {}) as EntityIssue[];

    if (issues.length === 0) {
      return { success: false, issueCount: 0, message: "No entity issues found yet. Run some audits first to accumulate findings." };
    }

    const issueSummary = aggregateIssues(issues);
    const prompt = buildSynthesisPrompt(issueSummary, issues.length);

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    const synthesizedText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!synthesizedText.trim()) {
      throw new Error("Claude returned empty synthesis — please try again.");
    }

    await ctx.runMutation(internal.sharedAgentDocuments.upsertGenerated, {
      agentId: AGENT_ID,
      content: synthesizedText,
    });

    return {
      success: true,
      issueCount: issues.length,
      message: `Memory regenerated from ${issues.length} findings across all projects.`,
    };
  },
});

/** Internal variant for cron/scheduled use — no user session required. */
export const synthesizePatternsInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[AuditIntelligence] ANTHROPIC_API_KEY not set — skipping scheduled synthesis.");
      return;
    }

    const issues = await ctx.runQuery(internal.entityIssues.listAllInternal, {}) as EntityIssue[];

    if (issues.length === 0) {
      console.log("[AuditIntelligence] No issues found — skipping synthesis.");
      return;
    }

    const issueSummary = aggregateIssues(issues);
    const prompt = buildSynthesisPrompt(issueSummary, issues.length);

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    const synthesizedText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!synthesizedText.trim()) {
      console.error("[AuditIntelligence] Empty synthesis returned — aborting upsert.");
      return;
    }

    await ctx.runMutation(internal.sharedAgentDocuments.upsertGenerated, {
      agentId: AGENT_ID,
      content: synthesizedText,
    });

    console.log(`[AuditIntelligence] Memory regenerated from ${issues.length} issues.`);
  },
});
