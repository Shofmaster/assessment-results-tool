import { useEffect, useState } from 'react';
import { useConvex } from 'convex/react';
import { useDocuments, useCompanyFeaturePolicyByProject } from './useConvexData';
import { resolveExtractedTextForConvexDoc } from '../utils/documentExtractedText';
import { SourceUnavailableError } from '../services/documentSourceResolver';
import {
  isStandardsReferenceCategory,
  STANDARDS_CATEGORY_TO_AGENT,
  type StandardsReferenceCategory,
} from '../constants/localReference';

export type AgentDoc = { name: string; text: string };

/**
 * Per-company compliance-standards documents, resolved on demand and grouped by the
 * auditor agent they feed (`STANDARDS_CATEGORY_TO_AGENT`).
 *
 * No-copy gate: when the company's `allowStandardsStorage` flag is ON, an AeroGap admin
 * has re-enabled the legacy shared-KB / store-a-copy path for this tenant, so this hook
 * returns `{}` and the legacy KB is left completely untouched. When the flag is OFF
 * (the default), standards live as metadata-only `documents` rows and their text is read
 * transiently from the customer-controlled source per session — never persisted by us.
 *
 * The returned map is additive: callers merge `byAgent[agentId]` into their existing
 * agent knowledge bases without disturbing shared/project docs.
 */
export function useStandardsAgentDocs(
  projectId: string | undefined,
): Record<string, AgentDoc[]> {
  const convex = useConvex();
  const docs = useDocuments(projectId);
  const policy = useCompanyFeaturePolicyByProject(projectId) as
    | { allowStandardsStorage?: boolean }
    | null
    | undefined;

  const [byAgent, setByAgent] = useState<Record<string, AgentDoc[]>>({});

  useEffect(() => {
    let cancelled = false;

    // Legacy escape hatch ON → leave the shared-KB path alone.
    if (policy?.allowStandardsStorage === true) {
      setByAgent({});
      return;
    }
    if (!docs) return;

    const standardsDocs = (docs as any[]).filter(
      (d) => typeof d.category === 'string' && isStandardsReferenceCategory(d.category),
    );
    if (standardsDocs.length === 0) {
      setByAgent({});
      return;
    }

    (async () => {
      const next: Record<string, AgentDoc[]> = {};
      for (const d of standardsDocs) {
        if (cancelled) return;
        const agentId = STANDARDS_CATEGORY_TO_AGENT[d.category as StandardsReferenceCategory];
        if (!agentId) continue;
        let text = '';
        try {
          text = (await resolveExtractedTextForConvexDoc(d, convex)).trim();
        } catch (err) {
          // Source not linked / unreachable → skip this doc rather than crash the audit.
          if (err instanceof SourceUnavailableError) {
            console.warn(`Skipping standard "${d.name || d._id}": ${err.message}`);
            continue;
          }
          throw err;
        }
        if (!text) continue;
        (next[agentId] ||= []).push({ name: d.name || 'Standard', text });
      }
      if (!cancelled) setByAgent(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [docs, policy, convex]);

  return byAgent;
}
