import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useConvex } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AUDIT_AGENTS } from '../services/auditAgents';
import type { AuditAgent } from '../types/auditSimulation';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { useAppStore } from '../store/appStore';
import { useTheme } from '../context/ThemeContext';
import {
  useCreateChecklistRunFromSelectedDocs,
  useCompanyFeaturePolicyByProject,
  useDocuments,
  useEntityProfile,
  useIsFeatureEnabled,
  useMergedEntityRevisionDocs,
  useSharedReferenceDocsResolved,
  useSimulationResults,
  useUserSettings,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { AUDIT_CHECKLIST_TEMPLATES } from '../config/auditChecklistTemplates';
import { downloadPlainTextPdf } from '../utils/exportPlainTextPdf';
import {
  ASK_AGENT_ROUTING_HISTORY_TURNS,
  buildRoutingQueryText,
  resolveRoutedAgentsForAsk,
  resolveSuggestedAgents,
  type AskAgentEntityContext,
} from '../utils/askAgentRouting';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useIndexSummary } from '../hooks/useIndexSummary';
import { useAutoBackfillOnMount } from '../hooks/useAutoBackfillOnMount';

type SearchTarget = 'agents' | 'internal';

type AssistantTurnMeta = {
  routedAgents: Array<{ id: string; name: string }>;
  retrievedDocs: Array<{ id: string; name: string; category: string }>;
  passageCount: number;
  docCount: number;
  fallback: boolean;
  manualRouting: boolean;
};

type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  meta?: AssistantTurnMeta;
};
const SPLASH_CHAT_HISTORY_MAX_TURNS = 80;

type InternalDestination = {
  path: string;
  label: string;
  description: string;
  keywords: string[];
};

function renderInlineMarkdown(text: string): Array<string | JSX.Element> {
  const nodes: Array<string | JSX.Element> = [];
  const tokenRegex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`link-${match.index}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
        >
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(<strong key={`strong-${match.index}`} className="font-semibold text-white">{match[4]}</strong>);
    } else if (match[5]) {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded bg-white/10 px-1 py-0.5 text-xs text-white">
          {match[5]}
        </code>
      );
    } else if (match[6]) {
      nodes.push(<em key={`em-${match.index}`} className="italic text-white/95">{match[6]}</em>);
    }
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderLightMarkdown(text: string): JSX.Element {
  const lines = text.split('\n');
  const blocks: JSX.Element[] = [];
  const bulletLines: string[] = [];

  const flushBullets = (keySuffix: number) => {
    if (bulletLines.length === 0) return;
    blocks.push(
      <ul key={`ul-${keySuffix}`} className="mb-3 list-disc space-y-1 pl-5 text-sm text-white/90">
        {bulletLines.map((line, idx) => (
          <li key={`li-${keySuffix}-${idx}`}>{renderInlineMarkdown(line)}</li>
        ))}
      </ul>
    );
    bulletLines.length = 0;
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushBullets(idx);
      return;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bullet) {
      bulletLines.push(bullet[1]);
      return;
    }

    flushBullets(idx);

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1 ? 'text-lg font-semibold text-white' : level === 2 ? 'text-base font-semibold text-white' : 'text-sm font-semibold text-white/95';
      blocks.push(
        <p key={`h-${idx}`} className={`mb-2 mt-1 ${cls}`}>
          {renderInlineMarkdown(heading[2])}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="mb-2 text-sm leading-7 text-white/90">
        {renderInlineMarkdown(line)}
      </p>
    );
  });

  flushBullets(lines.length + 1);
  return <div>{blocks}</div>;
}

function formatChatAsMarkdown(turns: ChatTurn[]): string {
  return turns
    .map((t) => (t.role === 'user' ? `**You:**\n${t.content}` : `**Assistant:**\n${t.content}`))
    .join('\n\n---\n\n');
}

function stripMarkdownSourcesSection(text: string): string {
  const idx = text.search(/^##\s+sources\s*$/im);
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd();
}

function truncateForChecklistName(s: string, max = 72): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type ChecklistItemDraft = { section: string; title: string; severity: 'major' };

function extractChecklistItemsFromAnswer(answer: string): ChecklistItemDraft[] {
  const lines = answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLike = lines
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter((line) => line.length > 8 && line.length <= 180);
  const source =
    bulletLike.length > 0
      ? bulletLike
      : answer
          .split(/[.!?]\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 18 && s.length <= 180)
          .slice(0, 8);

  const dedup = new Set<string>();
  return source
    .filter((title) => {
      const key = title.toLowerCase();
      if (dedup.has(key)) return false;
      dedup.add(key);
      return true;
    })
    .slice(0, 12)
    .map((title) => ({
      section: 'AI Recommended Actions',
      title,
      severity: 'major' as const,
    }));
}

async function extractChecklistItemsViaClaude(userQuestion: string, answerBody: string): Promise<ChecklistItemDraft[]> {
  const body = stripMarkdownSourcesSection(answerBody).slice(0, 14000);
  const response = await createClaudeMessage({
    model: DEFAULT_CLAUDE_MODEL,
    max_tokens: 2000,
    temperature: 0.15,
    system: [
      'You turn an aviation compliance Q&A into a concise checklist.',
      'Reply with ONLY a JSON array (no markdown fences, no commentary).',
      'Each element must be an object: {"title": string}.',
      'Between 4 and 12 items. Short imperative titles (under 180 characters).',
      'Reflect actionable points from the assistant answer, in context of the user question.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: `User question:\n${userQuestion.slice(0, 2000)}\n\nAssistant answer:\n${body}`,
      },
    ],
  });
  const text = response.content
    .filter((block): block is { type: string; text?: string } => block.type === 'text')
    .map((block) => block.text || '')
    .join('\n')
    .trim();
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ChecklistItemDraft[] = [];
  const seen = new Set<string>();
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const title = typeof (row as { title?: unknown }).title === 'string' ? (row as { title: string }).title.trim() : '';
    if (title.length < 6 || title.length > 220) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ section: 'AI Recommended Actions', title, severity: 'major' });
    if (out.length >= 12) break;
  }
  return out;
}

const SPLASH_DRAFT_STORAGE_PREFIX = 'aerogap_splash_draft_v1:';

function splashDraftStorageKey(userId: string): string {
  return `${SPLASH_DRAFT_STORAGE_PREFIX}${userId}`;
}

const KNOWN_SPLASH_AGENT_IDS: Set<string> = new Set(AUDIT_AGENTS.map((a) => a.id));

function normalizeSplashPickedAgentIds(raw: unknown): AuditAgent['id'][] {
  if (!Array.isArray(raw)) return [];
  const out: AuditAgent['id'][] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !KNOWN_SPLASH_AGENT_IDS.has(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item as AuditAgent['id']);
  }
  return out;
}

function normalizeAssistantMeta(raw: unknown): AssistantTurnMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const routedAgents = Array.isArray(obj.routedAgents)
    ? (obj.routedAgents as unknown[])
        .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>) : null))
        .filter((a): a is Record<string, unknown> => a !== null)
        .map((a) => ({ id: String(a.id || ''), name: String(a.name || '') }))
        .filter((a) => a.id || a.name)
    : [];
  const retrievedDocs = Array.isArray(obj.retrievedDocs)
    ? (obj.retrievedDocs as unknown[])
        .map((d) => (d && typeof d === 'object' ? (d as Record<string, unknown>) : null))
        .filter((d): d is Record<string, unknown> => d !== null)
        .map((d) => ({
          id: String(d.id || ''),
          name: String(d.name || ''),
          category: String(d.category || ''),
        }))
        .filter((d) => d.name)
    : [];
  return {
    routedAgents,
    retrievedDocs,
    passageCount: Number.isFinite(obj.passageCount) ? Number(obj.passageCount) : 0,
    docCount: Number.isFinite(obj.docCount) ? Number(obj.docCount) : 0,
    fallback: obj.fallback === true,
    manualRouting: obj.manualRouting === true,
  };
}

function normalizeChatTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    const turn: ChatTurn = { role, content: trimmed };
    if (role === 'assistant') {
      const meta = normalizeAssistantMeta((item as { meta?: unknown }).meta);
      if (meta) turn.meta = meta;
    }
    out.push(turn);
  }
  return out.slice(-SPLASH_CHAT_HISTORY_MAX_TURNS);
}

function previewChatTurn(turns: ChatTurn[]): string {
  const last = turns[turns.length - 1];
  if (!last) return 'No saved messages.';
  const prefix = last.role === 'user' ? 'You: ' : 'Assistant: ';
  const line = `${prefix}${last.content}`;
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

function readSavedAgentChatSnapshot(userId: string): ChatTurn[] {
  try {
    const raw = localStorage.getItem(splashDraftStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { agentChat?: unknown };
    return normalizeChatTurns(parsed.agentChat);
  } catch {
    return [];
  }
}

/** Categories treated as "company documents" for splash search context. */
const COMPANY_DOCUMENT_CATEGORIES = new Set([
  'uploaded',
  'entity',
  'regulatory',
  'sms',
  'reference',
  'mel',
  'maintenance_manual',
  'parts_catalog',
  'logbook_scan',
  'wiring_diagram',
]);

/**
 * Below this count of indexed documents, we pass the full set of indexed doc ids
 * to documentChunks.search to bypass ANN pre-filter drops. Above it, we let ANN
 * handle pre-filtering for performance.
 */
const ASK_AGENTS_FOCUS_THRESHOLD = 50;

function categoryLabel(category: unknown): string {
  switch (category) {
    case 'entity':
      return 'company manual/library';
    case 'regulatory':
      return 'regulatory reference';
    case 'mel':
      return 'MEL/MMEL';
    case 'reference':
      return 'reference library';
    case 'maintenance_manual':
      return 'maintenance manual';
    case 'uploaded':
      return 'uploaded file';
    case 'logbook':
      return 'logbook entry';
    default:
      return typeof category === 'string' && category ? category : 'document';
  }
}

function buildUploadedDocumentsContext(documents: any[]): { context: string; usedCount: number; totalAvailable: number } {
  const seenIds = new Set<string>();
  const uploadedWithText = (documents || []).filter((doc) => {
    if (!doc || typeof doc?.extractedText !== 'string' || doc.extractedText.trim().length === 0) return false;
    if (!COMPANY_DOCUMENT_CATEGORIES.has(doc?.category)) return false;
    const key = doc._id ? String(doc._id) : `${doc?.name || ''}|${doc?.category || ''}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });
  if (!uploadedWithText.length) {
    return { context: '', usedCount: 0, totalAvailable: 0 };
  }

  const maxDocs = 14;
  const maxTotalChars = 180000;
  let totalChars = 0;
  const chunks: string[] = [];
  let usedCount = 0;

  for (const doc of uploadedWithText.slice(0, maxDocs)) {
    const name = String(doc?.name || doc?.title || `Company document ${usedCount + 1}`).trim();
    const normalizedText = String(doc.extractedText)
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalizedText) continue;
    const label = categoryLabel(doc?.category);
    const heading = `### ${name}\n_source: ${label}_\n`;
    let body = normalizedText;
    if (totalChars + heading.length + body.length > maxTotalChars) {
      const remaining = maxTotalChars - totalChars - heading.length;
      if (remaining < 400) break;
      body = `${body.slice(0, remaining - 30)}\n[Context limit reached for this request.]`;
    }
    const chunk = `${heading}${body}`;
    if (totalChars + chunk.length > maxTotalChars) break;
    chunks.push(chunk);
    totalChars += chunk.length;
    usedCount += 1;
    if (totalChars >= maxTotalChars) break;
  }

  if (!chunks.length) {
    return { context: '', usedCount: 0, totalAvailable: uploadedWithText.length };
  }

  return {
    context: chunks.join('\n\n'),
    usedCount,
    totalAvailable: uploadedWithText.length,
  };
}

function buildSharedReferenceContext(documents: any[]): { context: string; usedCount: number; totalAvailable: number } {
  const docsWithText = (documents || []).filter(
    (doc) => typeof doc?.extractedText === 'string' && doc.extractedText.trim().length > 0
  );
  if (!docsWithText.length) {
    return { context: '', usedCount: 0, totalAvailable: 0 };
  }

  const maxDocs = 10;
  const maxTotalChars = 120000;
  let totalChars = 0;
  const chunks: string[] = [];
  let usedCount = 0;

  for (const doc of docsWithText.slice(0, maxDocs)) {
    const name = String(doc?.name || `Shared reference ${usedCount + 1}`).trim();
    const metaBits = [
      typeof doc?.documentType === 'string' ? `type: ${doc.documentType}` : '',
      typeof doc?.issuer === 'string' ? `issuer: ${doc.issuer}` : '',
      typeof doc?.revision === 'string' ? `revision: ${doc.revision}` : '',
    ].filter(Boolean);
    const normalizedText = String(doc.extractedText).replace(/\s+/g, ' ').trim();
    if (!normalizedText) continue;
    const metaLine = metaBits.length > 0 ? `\n_${metaBits.join(' | ')}_` : '';
    const heading = `### ${name}${metaLine}\n`;
    let body = normalizedText;
    if (totalChars + heading.length + body.length > maxTotalChars) {
      const remaining = maxTotalChars - totalChars - heading.length;
      if (remaining < 400) break;
      body = `${body.slice(0, remaining - 30)}\n[Context limit reached for this request.]`;
    }
    const chunk = `${heading}${body}`;
    if (totalChars + chunk.length > maxTotalChars) break;
    chunks.push(chunk);
    totalChars += chunk.length;
    usedCount += 1;
    if (totalChars >= maxTotalChars) break;
  }

  if (!chunks.length) {
    return { context: '', usedCount: 0, totalAvailable: docsWithText.length };
  }

  return {
    context: chunks.join('\n\n'),
    usedCount,
    totalAvailable: docsWithText.length,
  };
}

type RetrievedDocRef = { id: string; name: string; category: string };

function buildRetrievedPassageContext(chunks: any[]): {
  context: string;
  usedCount: number;
  docCount: number;
  docs: RetrievedDocRef[];
} {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return { context: '', usedCount: 0, docCount: 0, docs: [] };
  }
  const docIds = new Set<string>();
  const docsByOrder: RetrievedDocRef[] = [];
  const lines: string[] = [];
  for (const chunk of chunks) {
    const docId = String(chunk?.documentId || '');
    if (docId && !docIds.has(docId)) {
      docIds.add(docId);
      docsByOrder.push({
        id: docId,
        name: String(chunk?.docName || 'Company document').trim() || 'Company document',
        category: String(chunk?.category || ''),
      });
    }
    const docName = String(chunk?.docName || 'Company document').trim();
    const chunkIndex = Number.isFinite(chunk?.chunkIndex) ? Number(chunk.chunkIndex) + 1 : '?';
    const totalChunks = Number.isFinite(chunk?.totalChunks) ? Number(chunk.totalChunks) : '?';
    const category = categoryLabel(chunk?.category);
    const text = String(chunk?.text || '').trim();
    if (!text) continue;
    lines.push(`### ${docName} (passage ${chunkIndex}/${totalChunks})\n_source: ${category}_\n${text}`);
  }
  if (lines.length === 0) return { context: '', usedCount: 0, docCount: 0, docs: docsByOrder };
  return {
    context: lines.join('\n\n'),
    usedCount: lines.length,
    docCount: docIds.size,
    docs: docsByOrder,
  };
}

function buildRetrievedFullDocumentContext(documents: any[]): {
  context: string;
  usedCount: number;
  docs: RetrievedDocRef[];
} {
  if (!Array.isArray(documents) || documents.length === 0) {
    return { context: '', usedCount: 0, docs: [] };
  }
  const lines: string[] = [];
  const docs: RetrievedDocRef[] = [];
  for (const doc of documents) {
    const docName = String(doc?.docName || 'Company document').trim();
    const category = categoryLabel(doc?.category);
    const text = String(doc?.text || '').trim();
    if (!text) continue;
    lines.push(`### ${docName}\n_source: ${category}_\n${text}`);
    docs.push({
      id: String(doc?.documentId || ''),
      name: docName || 'Company document',
      category: String(doc?.category || ''),
    });
  }
  if (lines.length === 0) return { context: '', usedCount: 0, docs };
  return {
    context: lines.join('\n\n'),
    usedCount: lines.length,
    docs,
  };
}

function buildCompanyProfileContext(profile: any): { context: string; hasAny: boolean } {
  if (!profile || typeof profile !== 'object') return { context: '', hasAny: false };

  const scalarRows: Array<[string, unknown]> = [
    ['Company name', profile.companyName],
    ['Legal entity', profile.legalEntityName],
    ['Primary location', profile.primaryLocation],
    ['Primary contact', profile.contactName],
    ['Contact email', profile.contactEmail],
    ['Contact phone', profile.contactPhone],
    ['Repair station type', profile.repairStationType],
    ['Operations scope', profile.operationsScope],
    ['SMS maturity', profile.smsMaturity],
  ];

  const lines: string[] = [];
  for (const [label, rawValue] of scalarRows) {
    if (typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    if (!value) continue;
    lines.push(`- ${label}: ${value}`);
  }

  const numberRows: Array<[string, unknown]> = [
    ['Facility square footage', profile.facilitySquareFootage],
    ['Employee count', profile.employeeCount],
  ];
  for (const [label, rawValue] of numberRows) {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) continue;
    lines.push(`- ${label}: ${rawValue}`);
  }

  const listRows: Array<[string, unknown]> = [
    ['Certifications', profile.certifications],
    ['Aircraft categories', profile.aircraftCategories],
    ['Services offered', profile.servicesOffered],
  ];
  for (const [label, rawValue] of listRows) {
    if (!Array.isArray(rawValue) || rawValue.length === 0) continue;
    const values = rawValue
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
    if (values.length === 0) continue;
    lines.push(`- ${label}: ${values.join(', ')}`);
  }

  if (typeof profile.hasSms === 'boolean') {
    lines.push(`- Has SMS program: ${profile.hasSms ? 'Yes' : 'No'}`);
  }

  if (lines.length === 0) return { context: '', hasAny: false };
  return {
    context: lines.join('\n'),
    hasAny: true,
  };
}

function AssistantTurnMetaStrip({ meta, onOpenDoc }: { meta: AssistantTurnMeta; onOpenDoc: (doc: RetrievedDocRef) => void }) {
  const hasAgents = meta.routedAgents.length > 0;
  const hasDocs = meta.retrievedDocs.length > 0;
  if (!hasAgents && !hasDocs && meta.passageCount === 0 && !meta.fallback) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2 text-[11px] text-white/55">
      {hasAgents ? (
        <p>
          <span className="text-white/45">Asked: </span>
          <span className="text-white/80">{meta.routedAgents.map((a) => a.name).join(' · ')}</span>
          {meta.manualRouting ? <span className="ml-1 text-white/45">(manual)</span> : null}
        </p>
      ) : null}
      {hasDocs ? (
        <p className="flex flex-wrap items-baseline gap-x-1">
          <span className="text-white/45">Manuals: </span>
          {meta.retrievedDocs.map((doc, idx) => (
            <span key={`${doc.id || doc.name}-${idx}`} className="inline-flex items-baseline">
              <button
                type="button"
                onClick={() => onOpenDoc(doc)}
                className="text-sky-200 underline-offset-2 hover:underline"
              >
                {doc.name}
              </button>
              {idx < meta.retrievedDocs.length - 1 ? <span className="text-white/35"> · </span> : null}
            </span>
          ))}
        </p>
      ) : null}
      {(meta.passageCount > 0 || meta.docCount > 0 || meta.fallback) ? (
        <p className="text-white/40">
          {meta.passageCount > 0 ? `${meta.passageCount} passages` : null}
          {meta.passageCount > 0 && meta.docCount > 0 ? ' · ' : null}
          {meta.docCount > 0 ? `${meta.docCount} docs` : null}
          {meta.fallback ? ' · fallback preview' : null}
        </p>
      ) : null}
    </div>
  );
}

function ChatThread({
  turns,
  bottomRef,
  isLoading,
  onOpenDoc,
}: {
  turns: ChatTurn[];
  bottomRef: MutableRefObject<HTMLDivElement | null>;
  isLoading: boolean;
  onOpenDoc: (doc: RetrievedDocRef) => void;
}) {
  return (
    <div className="mt-3 max-h-[min(45vh,640px)] w-full overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-navy-900/45 p-4 pr-3 [scrollbar-gutter:stable] xl:mx-auto xl:max-w-6xl 2xl:max-w-7xl">
      <div className="flex flex-col gap-3">
        {turns.map((turn, i) => (
          <div key={`${turn.role}-${i}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`w-fit max-w-[min(100%,54rem)] 2xl:max-w-[min(100%,60rem)] rounded-2xl px-4 py-3 ${
                turn.role === 'user'
                  ? 'border border-sky/35 bg-sky/20 text-white'
                  : 'border border-white/10 bg-navy-950/80 text-white/90'
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                {turn.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <div className="text-sm leading-6">{renderLightMarkdown(turn.content)}</div>
              {turn.role === 'assistant' && turn.meta ? (
                <AssistantTurnMetaStrip meta={turn.meta} onOpenDoc={onOpenDoc} />
              ) : null}
            </div>
          </div>
        ))}
        {isLoading ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-white/10 bg-navy-950/60 px-4 py-3 text-sm text-white/55">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky/80" aria-hidden />
                Thinking…
              </span>
            </div>
          </div>
        ) : null}
        <div
          ref={(el) => {
            bottomRef.current = el;
          }}
          className="h-px w-full shrink-0"
          aria-hidden
        />
      </div>
    </div>
  );
}

const INTERNAL_DESTINATIONS: InternalDestination[] = [
  {
    path: '/quality-command-center',
    label: 'Quality & Compliance',
    description: 'QM hub: readiness summary, audit prep, CARs, roster, inspections, and checklists',
    keywords: ['quality', 'dashboard', 'command', 'chief', 'inspector', 'readiness', 'qm', 'prep', 'compliance'],
  },
  { path: '/logbook', label: 'Logbook Management', description: 'Projects and records', keywords: ['logbook', 'project', 'records'] },
  { path: '/logbook?tab=schedule', label: 'Schedule', description: 'Inspection schedule', keywords: ['schedule', 'inspection', 'recurring'] },
  { path: '/form-337', label: 'FAA Form 337', description: 'Form 337 records', keywords: ['337', 'form 337', 'faa', 'major repair', 'alteration'] },
  { path: '/library', label: 'Library', description: 'Standards library', keywords: ['library', 'references', 'standards'] },
  { path: '/review', label: 'Paperwork Review', description: 'Document findings', keywords: ['paperwork', 'documents', 'findings'] },
  { path: '/analysis', label: 'Analysis', description: 'AI analysis', keywords: ['analysis', 'insights', 'ai'] },
  { path: '/entity-issues', label: 'CARs & Issues', description: 'Corrective actions', keywords: ['cars', 'issues', 'corrective'] },
  { path: '/guided-audit', label: 'Guided Audit', description: 'Compliance review', keywords: ['guided', 'checklist', 'review'] },
  { path: '/audit', label: 'Audit Simulation', description: 'Agent audit chat', keywords: ['audit', 'simulation', 'agents'] },
];

export default function SplashPage() {
  const navigate = useNavigate();
  const convex = useConvex();
  const { user } = useUser();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const chatUtilityButtonClass = isDarkMode
    ? 'inline-flex h-8 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-semibold text-white/90 hover:bg-white/10'
    : 'inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100';
  const chatUtilityStrongButtonClass = isDarkMode
    ? 'inline-flex h-8 items-center justify-center rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15'
    : 'inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-200';
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const isChecklistsEnabled = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const profile = useEntityProfile(activeProjectId || undefined) as any;
  const userSettings = useUserSettings() as any;
  const companyPolicy = useCompanyFeaturePolicyByProject(activeProjectId || undefined) as any;
  const sharedReferenceDocs = (useSharedReferenceDocsResolved() || []) as any[];
  const projectDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const mergedEntityDocs = (useMergedEntityRevisionDocs(activeProjectId || undefined) || []) as any[];
  const companyDocumentPool = useMemo(() => {
    const byId = new Map<string, any>();
    for (const doc of [...projectDocuments, ...mergedEntityDocs]) {
      if (!doc) continue;
      const id = doc._id ? String(doc._id) : `${doc?.name || ''}|${doc?.category || ''}`;
      if (!byId.has(id)) byId.set(id, doc);
    }
    return Array.from(byId.values());
  }, [projectDocuments, mergedEntityDocs]);
  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const createChecklistRunFromSelectedDocs = useCreateChecklistRunFromSelectedDocs();
  const [query, setQuery] = useState('');
  // Internal-search target was removed in favor of an inline "Go to" pill. We keep the
  // state typed so old localStorage drafts that wrote `target: 'internal'` still parse,
  // but the value is forced back to 'agents' on hydrate and never set elsewhere.
  const [target, setTarget] = useState<SearchTarget>('agents');
  const [isLoading, setIsLoading] = useState(false);
  const [agentChat, setAgentChat] = useState<ChatTurn[]>([]);
  const [persistPreviousChats, setPersistPreviousChats] = useState(true);
  const [isCreatingChecklist, setIsCreatingChecklist] = useState(false);
  const [useUploadedDocsContext, setUseUploadedDocsContext] = useState(true);
  const [useFullDocumentContext, setUseFullDocumentContext] = useState(true);
  const [forceCompanyContext, setForceCompanyContext] = useState(false);
  const [hasDraftForceCompanyContext, setHasDraftForceCompanyContext] = useState(false);
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [splashDraftHydrated, setSplashDraftHydrated] = useState(false);
  const [savedAgentChatSnapshot, setSavedAgentChatSnapshot] = useState<ChatTurn[]>([]);
  /** When false, experts = suggestions from wording ∪ always-include pins. When true, only splashAskAgentsPickedIds (fixed; query changes do not alter it). */
  const [splashAskAgentsManual, setSplashAskAgentsManual] = useState(false);
  const [splashAskAgentsPickedIds, setSplashAskAgentsPickedIds] = useState<AuditAgent['id'][]>([]);
  /** In auto mode: merged into every message on top of suggested agents. Add/remove anytime. */
  const [splashAskAgentPinnedIds, setSplashAskAgentPinnedIds] = useState<AuditAgent['id'][]>([]);
  const [splashDocPickerIds, setSplashDocPickerIds] = useState<Id<'documents'>[]>([]);
  const [lastRetrievedPassageCount, setLastRetrievedPassageCount] = useState(0);
  const [lastRetrievedDocCount, setLastRetrievedDocCount] = useState(0);
  const [usedFallbackContext, setUsedFallbackContext] = useState(false);
  const [showIndexHealth, setShowIndexHealth] = useState(false);
  const [isManualReindexing, setIsManualReindexing] = useState(false);
  const agentChatBottomRef = useRef<HTMLDivElement>(null);
  const splashSearchRef = useRef<HTMLTextAreaElement>(null);

  const { summary: indexSummary, refetch: refetchIndexSummary } = useIndexSummary(
    activeProjectId as Id<'projects'> | null,
  );
  useAutoBackfillOnMount(
    activeProjectId as Id<'projects'> | null,
    indexSummary,
    refetchIndexSummary,
  );

  const handleManualReindex = async () => {
    if (!activeProjectId) return;
    setIsManualReindexing(true);
    try {
      const result = (await convex.action((api as any).documentChunks.backfillAll, {
        projectId: activeProjectId as Id<'projects'>,
      })) as { queued: number };
      if (result?.queued > 0) {
        toast.success(`Re-indexing ${result.queued} document${result.queued === 1 ? '' : 's'}…`);
        window.setTimeout(() => {
          void refetchIndexSummary();
        }, 1500);
      } else {
        toast.success('Nothing to re-index — all eligible documents are already indexed.');
        void refetchIndexSummary();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Re-index failed.');
    } finally {
      setIsManualReindexing(false);
    }
  };

  const latestAgentAssistant = [...agentChat].reverse().find((m) => m.role === 'assistant');
  const agentResponse = latestAgentAssistant?.content ?? '';

  useLayoutEffect(() => {
    const el = splashSearchRef.current;
    if (!el) return;
    const max = Math.min(window.innerHeight * 0.5, 480);
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [query]);

  useEffect(() => {
    if (target !== 'agents') return;
    agentChatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [target, agentChat, isLoading]);

  useEffect(() => {
    if (agentChat.length > 0) setShowAgentSettings(false);
  }, [agentChat.length]);

  useEffect(() => {
    if (!user?.id) {
      setSplashDraftHydrated(false);
      return;
    }

    setSplashDraftHydrated(false);
    setAgentChat([]);
    setPersistPreviousChats(true);
    setSplashAskAgentsManual(false);
    setSplashAskAgentsPickedIds([]);
    setSplashAskAgentPinnedIds([]);
    setHasDraftForceCompanyContext(false);

    try {
      const raw = localStorage.getItem(splashDraftStorageKey(user.id));
      if (raw) {
        const parsed = JSON.parse(raw) as {
          query?: unknown;
          target?: unknown;
          persistPreviousChats?: unknown;
          agentChat?: unknown;
          useUploadedDocsContext?: unknown;
          useFullDocumentContext?: unknown;
          forceCompanyContext?: unknown;
          splashAskAgentsManual?: unknown;
          splashAskAgentsPickedIds?: unknown;
          splashAskAgentPinnedIds?: unknown;
          splashDocPickerIds?: unknown;
        };
        if (typeof parsed.query === 'string') setQuery(parsed.query);
        // Target is always 'agents' now; ignore the persisted value.
        setTarget('agents');
        const persistChats = parsed.persistPreviousChats !== false;
        setPersistPreviousChats(persistChats);
        if (persistChats) {
          setAgentChat(normalizeChatTurns(parsed.agentChat));
        } else {
          setAgentChat([]);
        }
        if (typeof parsed.useUploadedDocsContext === 'boolean') {
          setUseUploadedDocsContext(parsed.useUploadedDocsContext);
        }
        if (typeof parsed.useFullDocumentContext === 'boolean') {
          setUseFullDocumentContext(parsed.useFullDocumentContext);
        }
        if (typeof parsed.forceCompanyContext === 'boolean') {
          setForceCompanyContext(parsed.forceCompanyContext);
          setHasDraftForceCompanyContext(true);
        } else {
          setHasDraftForceCompanyContext(false);
        }
        const picked = normalizeSplashPickedAgentIds(parsed.splashAskAgentsPickedIds);
        const manual = parsed.splashAskAgentsManual === true && picked.length > 0;
        setSplashAskAgentsManual(manual);
        setSplashAskAgentsPickedIds(manual ? picked : []);
        setSplashAskAgentPinnedIds(normalizeSplashPickedAgentIds(parsed.splashAskAgentPinnedIds));
        if (Array.isArray(parsed.splashDocPickerIds)) {
          setSplashDocPickerIds(
            parsed.splashDocPickerIds
              .filter((id): id is string => typeof id === 'string' && id.length > 0)
              .map((id) => id as Id<'documents'>)
          );
        } else {
          setSplashDocPickerIds([]);
        }
      } else {
        setQuery('');
        setTarget('agents');
        setPersistPreviousChats(true);
        setUseUploadedDocsContext(true);
        setUseFullDocumentContext(true);
        setForceCompanyContext(false);
        setHasDraftForceCompanyContext(false);
        setSplashAskAgentsManual(false);
        setSplashAskAgentsPickedIds([]);
        setSplashAskAgentPinnedIds([]);
        setSplashDocPickerIds([]);
      }
    } catch {
      setQuery('');
      setTarget('agents');
      setPersistPreviousChats(true);
      setUseUploadedDocsContext(true);
      setUseFullDocumentContext(true);
      setForceCompanyContext(false);
      setHasDraftForceCompanyContext(false);
      setSplashAskAgentsManual(false);
      setSplashAskAgentsPickedIds([]);
      setSplashAskAgentPinnedIds([]);
      setSplashDocPickerIds([]);
    }
    setSplashDraftHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    if (!splashDraftHydrated) return;
    if (hasDraftForceCompanyContext) return;
    setForceCompanyContext(userSettings?.forceCompanyContextDefault === true);
  }, [splashDraftHydrated, hasDraftForceCompanyContext, userSettings?.forceCompanyContextDefault]);

  useEffect(() => {
    if (!user?.id || !splashDraftHydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          splashDraftStorageKey(user.id),
          JSON.stringify({
            query,
            target,
            persistPreviousChats,
            ...(persistPreviousChats
              ? {
                  agentChat: agentChat.slice(-SPLASH_CHAT_HISTORY_MAX_TURNS),
                }
              : {}),
            useUploadedDocsContext,
            useFullDocumentContext,
            forceCompanyContext,
            splashAskAgentsManual: splashAskAgentsManual && splashAskAgentsPickedIds.length > 0,
            splashAskAgentsPickedIds,
            splashAskAgentPinnedIds,
            splashDocPickerIds,
          })
        );
      } catch {
        /* quota / private mode */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [user?.id, query, target, persistPreviousChats, agentChat, useUploadedDocsContext, useFullDocumentContext, forceCompanyContext, splashDraftHydrated, splashAskAgentsManual, splashAskAgentsPickedIds, splashAskAgentPinnedIds, splashDocPickerIds]);

  useEffect(() => {
    if (!user?.id) {
      setSavedAgentChatSnapshot([]);
      return;
    }
    setSavedAgentChatSnapshot(readSavedAgentChatSnapshot(user.id));
  }, [user?.id, splashDraftHydrated, agentChat]);

  const normalizedQuery = query.trim().toLowerCase();
  const latestSimulation = useMemo(() => {
    if (!simulationResults.length) return null;
    return simulationResults
      .slice()
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))[0];
  }, [simulationResults]);

  const enabledAgentIds = userSettings?.enabledAgents ?? null;
  const availableAgentsForAsk = useMemo(
    () =>
      enabledAgentIds === null
        ? AUDIT_AGENTS
        : AUDIT_AGENTS.filter((a) => enabledAgentIds.includes(a.id)),
    [enabledAgentIds],
  );

  const entityTypeContext = useMemo(() => {
    const selectedPerspective = 'generic';
    const faaParts: string[] = Array.isArray((latestSimulation as any)?.faaConfig?.partsScope)
      ? ((latestSimulation as any).faaConfig.partsScope as string[])
      : [];
    const publicUseEntityType = (latestSimulation as any)?.publicUseConfig?.entityType as string | undefined;
    const publicUseFocus = (latestSimulation as any)?.publicUseConfig?.auditFocus as string | undefined;

    const labels: string[] = [];
    if (faaParts.length) labels.push(`FAA parts: ${faaParts.join(', ')}`);
    if (publicUseEntityType) labels.push(`entity: ${publicUseEntityType}`);
    if (publicUseFocus) labels.push(`focus: ${publicUseFocus}`);

    return {
      selectedPerspective,
      faaParts,
      publicUseEntityType,
      publicUseFocus,
      labels,
    };
  }, [latestSimulation]);
  const hasEntityTypeContext = entityTypeContext.labels.length > 0;

  const internalResults = useMemo(() => {
    if (!normalizedQuery) return INTERNAL_DESTINATIONS;
    return INTERNAL_DESTINATIONS.filter((item) => {
      const haystack = `${item.label} ${item.description} ${item.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  const askAgentEntityContext = useMemo((): AskAgentEntityContext => {
    return {
      selectedPerspective: entityTypeContext.selectedPerspective,
      faaParts: entityTypeContext.faaParts,
      publicUseEntityType: entityTypeContext.publicUseEntityType,
      publicUseFocus: entityTypeContext.publicUseFocus,
    };
  }, [entityTypeContext]);

  const recentUserMessagesForRouting = useMemo(
    () =>
      agentChat
        .filter((turn): turn is ChatTurn & { role: 'user' } => turn.role === 'user')
        .map((turn) => turn.content),
    [agentChat],
  );

  const routingQueryText = useMemo(
    () => buildRoutingQueryText(query, recentUserMessagesForRouting, ASK_AGENT_ROUTING_HISTORY_TURNS),
    [query, recentUserMessagesForRouting],
  );

  const suggestedAgents = useMemo(
    () => resolveSuggestedAgents(routingQueryText, askAgentEntityContext, availableAgentsForAsk),
    [routingQueryText, askAgentEntityContext, availableAgentsForAsk],
  );

  const suggestedIdSet = useMemo(() => new Set(suggestedAgents.map((a) => a.id)), [suggestedAgents]);
  const companyDocumentPickerOptions = useMemo(
    () =>
      companyDocumentPool
        .filter((doc) => COMPANY_DOCUMENT_CATEGORIES.has(doc?.category))
        .map((doc) => ({
          id: String(doc._id) as Id<'documents'>,
          name: String(doc?.name || 'Company document'),
          category: String(doc?.category || 'uploaded'),
        })),
    [companyDocumentPool]
  );
  useEffect(() => {
    const available = new Set(companyDocumentPickerOptions.map((doc) => doc.id));
    setSplashDocPickerIds((prev) => prev.filter((id) => available.has(id)));
  }, [companyDocumentPickerOptions]);
  const uploadedDocsContext = useMemo(() => buildUploadedDocumentsContext(companyDocumentPool), [companyDocumentPool]);
  const sharedReferenceContext = useMemo(
    () => buildSharedReferenceContext(sharedReferenceDocs),
    [sharedReferenceDocs]
  );
  const companyProfileContext = useMemo(() => buildCompanyProfileContext(profile), [profile]);
  const companyPolicyForceCompanyContext = useMemo(() => {
    if (typeof companyPolicy?.forceCompanyContextDefault === 'boolean') {
      return companyPolicy.forceCompanyContextDefault;
    }
    return undefined;
  }, [companyPolicy?.forceCompanyContextDefault]);
  // Always-on by default. The user toggle is removed from the UI; the only signal
  // that still flips force-company-context off is the admin company policy override.
  const hasAnyCompanyDocs = useMemo(
    () => (sharedReferenceContext.totalAvailable > 0) || (companyDocumentPickerOptions.length > 0),
    [sharedReferenceContext.totalAvailable, companyDocumentPickerOptions.length]
  );
  const effectiveForceCompanyContext = useMemo(
    () => companyPolicyForceCompanyContext ?? hasAnyCompanyDocs,
    [companyPolicyForceCompanyContext, hasAnyCompanyDocs]
  );
  // Retrieval is always on. The persisted `useUploadedDocsContext` is kept as a
  // localStorage migration value but does not gate behavior anymore.
  const effectiveUseUploadedDocsContext = true;
  // Full-document mode is always on. Falls back to passages internally when retrieval
  // returns no full-doc text, so there is no need for a per-user toggle.
  const effectiveUseFullDocumentContext = true;

  const allIndexedDocIds = useMemo<Id<'documents'>[]>(() => {
    if (!indexSummary) return [];
    return indexSummary.perDoc
      .filter((doc) => doc.chunkCount > 0)
      .map((doc) => doc.documentId as Id<'documents'>);
  }, [indexSummary]);

  const routedAgentsForAsk = useMemo(
    () =>
      resolveRoutedAgentsForAsk({
        manual: splashAskAgentsManual,
        pickedIds: splashAskAgentsPickedIds,
        pinnedIds: splashAskAgentPinnedIds,
        routingQuery: routingQueryText,
        entity: askAgentEntityContext,
        agents: availableAgentsForAsk,
      }),
    [
      splashAskAgentsManual,
      splashAskAgentsPickedIds,
      splashAskAgentPinnedIds,
      routingQueryText,
      askAgentEntityContext,
      availableAgentsForAsk,
    ],
  );

  const nextRosterNames = useMemo(() => {
    if (routedAgentsForAsk.length === 0) return '—';
    return routedAgentsForAsk.map((a) => a.name).join(', ');
  }, [routedAgentsForAsk]);

  const shouldOfferChecklist = useMemo(() => {
    const text = agentResponse.toLowerCase();
    if (!text) return false;
    return (
      /(^|\n)\s*(\-|\*|\d+\.)\s+/.test(agentResponse) ||
      /\b(checklist|steps?|actions?|must|should|recommend|corrective action|follow-up)\b/.test(text)
    );
  }, [agentResponse]);

  const handleCreateChecklistFromAnswer = async () => {
    if (!activeProjectId) {
      toast.error('Select a project first to create a checklist.');
      navigate('/logbook');
      return;
    }
    if (!agentResponse.trim()) {
      toast.error('No answer available to build a checklist from.');
      return;
    }
    const template = AUDIT_CHECKLIST_TEMPLATES[0];
    const variant = template?.variants[0];
    if (!template || !variant) {
      toast.error('No checklist template is configured.');
      return;
    }
    const lastUser = [...agentChat].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
    const answerBody = stripMarkdownSourcesSection(agentResponse);
    let aiItems = extractChecklistItemsFromAnswer(answerBody);

    const selectedProjectDocumentIds = projectDocuments
      .filter((doc) => (doc.extractedText || '').trim().length > 0)
      .slice(0, 10)
      .map((doc) => doc._id);

    const checklistTitle = lastUser
      ? `${truncateForChecklistName(lastUser)} — ${new Date().toLocaleDateString()}`
      : `Search checklist — ${new Date().toLocaleDateString()}`;

    setIsCreatingChecklist(true);
    try {
      if (aiItems.length === 0) {
        aiItems = await extractChecklistItemsViaClaude(lastUser || answerBody.slice(0, 500), agentResponse);
      }
      if (aiItems.length === 0) {
        toast.error('Could not extract checklist items from the answer.');
        return;
      }
      const runId = await createChecklistRunFromSelectedDocs({
        projectId: activeProjectId as any,
        profileId: profile?._id,
        name: checklistTitle,
        framework: template.framework,
        frameworkLabel: template.label,
        subtypeId: variant.id,
        subtypeLabel: variant.label,
        generatedFromTemplateVersion: template.version,
        items: aiItems,
        selectedProjectDocumentIds: selectedProjectDocumentIds as any[],
        selectedSharedReferenceDocumentIds: [],
      });
      toast.success('Checklist created from answer');
      navigate(`/checklists?runId=${encodeURIComponent(String(runId))}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create checklist');
    } finally {
      setIsCreatingChecklist(false);
    }
  };

  const exportAgentAnswerPdf = async () => {
    if (agentChat.length === 0) return;
    try {
      await downloadPlainTextPdf({
        filename: `aerogap-agents-${new Date().toISOString().slice(0, 10)}.pdf`,
        title: 'AeroGap — Agent search answer',
        query:
          [...agentChat].reverse().find((m) => m.role === 'user')?.content?.trim() ||
          query.trim() ||
          'Conversation',
        bodyMarkdown: formatChatAsMarkdown(agentChat),
        modeLabel:
          splashAskAgentsManual && splashAskAgentsPickedIds.length > 0
            ? 'Ask agents (manual roster)'
            : splashAskAgentPinnedIds.length > 0
              ? 'Ask agents (auto + always include)'
              : 'Ask agents (auto)',
      });
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create PDF');
    }
  };

  const beginSplashManualExperts = () => {
    const merged = [...new Set([...suggestedAgents.map((a) => a.id), ...splashAskAgentPinnedIds])];
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds(merged);
  };

  const endSplashManualExperts = () => {
    setSplashAskAgentsManual(false);
    setSplashAskAgentsPickedIds([]);
  };

  const toggleSplashAskExpert = (id: AuditAgent['id']) => {
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSplashAlwaysInclude = (id: AuditAgent['id']) => {
    if (splashAskAgentsManual) return;
    setSplashAskAgentPinnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const clearSplashAlwaysInclude = () => {
    setSplashAskAgentPinnedIds([]);
  };

  const toggleFocusedDocument = (id: Id<'documents'>) => {
    setSplashDocPickerIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  };

  const clearFocusedDocuments = () => {
    setSplashDocPickerIds([]);
  };

  const selectAllSplashAskExperts = () => {
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds(availableAgentsForAsk.map((a) => a.id));
  };

  const clearSplashAskExpertChecks = () => {
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds([]);
  };

  const clearSavedChatHistory = () => {
    setAgentChat([]);

    if (!user?.id) return;
    try {
      const key = splashDraftStorageKey(user.id);
      const raw = localStorage.getItem(key);
      if (!raw) {
        toast.success('Saved chat history cleared');
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      delete parsed.agentChat;
      delete parsed.claudeChat;
      localStorage.setItem(key, JSON.stringify(parsed));
      toast.success('Saved chat history cleared');
    } catch {
      toast.error('Could not clear saved chat history');
    }
  };

  const loadSavedAgentChat = () => {
    if (!user?.id) return;
    const snapshot = readSavedAgentChatSnapshot(user.id);
    if (snapshot.length === 0) {
      toast.error('No saved Ask Agents chat found.');
      return;
    }
    setPersistPreviousChats(true);
    setTarget('agents');
    setAgentChat(snapshot);
    toast.success('Loaded saved Ask Agents chat.');
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('Enter a search query.');
      return;
    }

    if (target === 'agents') {
      const routed = routedAgentsForAsk;
      if (routed.length === 0) {
        toast.error('Select at least one expert, or switch back to auto routing.');
        return;
      }
      if (agentChat.length === 0) setShowAgentSettings(false);
      setIsLoading(true);
      const messagesForApi: ChatTurn[] = [...agentChat, { role: 'user', content: trimmed }];
      try {
        let retrievedPassageContext: {
          context: string;
          usedCount: number;
          docCount: number;
          docs: RetrievedDocRef[];
        } = { context: '', usedCount: 0, docCount: 0, docs: [] };
        let retrievedFullDocContext: { context: string; usedCount: number; docs: RetrievedDocRef[] } = {
          context: '',
          usedCount: 0,
          docs: [],
        };
        let fallbackUsed = false;
        if (effectiveUseUploadedDocsContext && activeProjectId) {
          try {
            const autoFocusIds: Id<'documents'>[] | undefined =
              splashDocPickerIds.length > 0
                ? splashDocPickerIds
                : allIndexedDocIds.length > 0 &&
                    allIndexedDocIds.length <= ASK_AGENTS_FOCUS_THRESHOLD
                  ? allIndexedDocIds
                  : undefined;
            const retrieved = await convex.action((api as any).documentChunks.search, {
              projectId: activeProjectId as Id<'projects'>,
              query: trimmed,
              documentIds: autoFocusIds,
              categories: [
                'uploaded',
                'entity',
                'regulatory',
                'sms',
                'reference',
                'mel',
                'maintenance_manual',
                'parts_catalog',
                'logbook_scan',
                'wiring_diagram',
              ],
              topK: 12,
              includeFullDocuments: effectiveUseFullDocumentContext,
              maxFullDocuments: 12,
            });
            retrievedPassageContext = buildRetrievedPassageContext((retrieved as any)?.chunks || []);
            retrievedFullDocContext = buildRetrievedFullDocumentContext((retrieved as any)?.documents || []);
          } catch {
            // Fall back to inline prompt context when retrieval index is unavailable.
            retrievedPassageContext = { context: '', usedCount: 0, docCount: 0, docs: [] };
            retrievedFullDocContext = { context: '', usedCount: 0, docs: [] };
          }
          if (!retrievedFullDocContext.context && !retrievedPassageContext.context && uploadedDocsContext.context) {
            fallbackUsed = true;
          }
        }
        setLastRetrievedPassageCount(retrievedPassageContext.usedCount);
        setLastRetrievedDocCount(retrievedPassageContext.docCount);
        setUsedFallbackContext(fallbackUsed);

        const availableAgents = routed
          .map((agent) => `- ${agent.name} (${agent.id}): ${agent.role}`)
          .join('\n');
        const systemLines = [
          'You are an aviation audit and compliance assistant for AeroGap.',
          'Your job is to answer the user\'s question using the listed expert perspectives and any retrieved company documents below.',
          'CRITICAL: Never reply that a topic is "outside your scope" or that you "cannot answer". You are a general aviation audit assistant — answer every aviation/compliance/manuals question to the best of your ability.',
          'If the user asks about a company document type (MEL/MMEL, GMM, QCM, RSM, ops specs, training program, SMS manual, parts catalog, maintenance manual, logbook, etc.), answer using the retrieved document passages/full text below. If no relevant document was retrieved, answer from general industry/regulatory knowledge and clearly note that no company document was found.',
          'If the question is borderline relevant (e.g. operational vs. maintenance) still answer; only decline if the question is clearly unrelated to aviation, safety, quality, or compliance.',
          'Use the listed experts only as perspective. If one expert is clearly best, answer from that perspective. If multiple are needed, synthesize a single direct answer.',
          'You are in a multi-turn chat: use earlier user and assistant messages for context, follow-ups, and clarifications.',
          'Do not mention expert names, agent names, roles, or routing decisions in the output.',
          'Keep the response practical and concise, with clear action steps when applicable.',
          'Where you state requirements or interpret rules, cite the underlying authority in the prose (for example "per 14 CFR §145.51" or "FAA AC 120-92B recommends…") when specific.',
          'After your main answer, add a markdown section titled exactly "## Sources". Under Sources, use bullet lines ("- ") listing each regulation, AC, standard, or company document you relied on. If you relied on general practice without a named document, say so. Do not fabricate citations.',
          'Available experts for this question:',
          availableAgents,
        ];
        if (hasEntityTypeContext) {
          const expertsIdx = systemLines.findIndex((line) => line === 'Available experts for this question:');
          if (expertsIdx !== -1) {
            systemLines.splice(
              expertsIdx,
              0,
              '',
              `Entity context (advisory only — do not use to refuse questions): ${entityTypeContext.labels.join(' | ')}`,
              'When the configured regulatory part differs from the question topic, still answer the question; just note the framework difference if relevant.',
              ''
            );
          }
        }
        if (effectiveUseUploadedDocsContext && effectiveUseFullDocumentContext && retrievedFullDocContext.context) {
          systemLines.push(
            '',
            'Use the full text for the retrieved company documents below as primary evidence when relevant to the question.',
            'If this context still does not contain a required fact, state that clearly before falling back to general standards/guidance.',
            'When you cite company material, name the document in the prose (e.g., "per the General Maintenance Manual §4.2").',
            '',
            `Retrieved company documents (full text from ${retrievedFullDocContext.usedCount} docs):`,
            retrievedFullDocContext.context
          );
        } else if (effectiveUseUploadedDocsContext && retrievedPassageContext.context) {
          systemLines.push(
            '',
            'Use the retrieved company document passages below as primary evidence when relevant to the question.',
            'If these passages do not contain a required fact, state that clearly before falling back to general standards/guidance.',
            'When you cite company material, name the document in the prose (e.g., "per the General Maintenance Manual §4.2").',
            '',
            `Company document retrieval (${retrievedPassageContext.usedCount} passages from ${retrievedPassageContext.docCount} docs):`,
            retrievedPassageContext.context
          );
        } else if (effectiveUseUploadedDocsContext && uploadedDocsContext.context) {
          systemLines.push(
            '',
            'Use the company document preview context below as primary evidence when relevant to the question.',
            'Note: retrieval passages are unavailable for this query, so this fallback may be less complete.',
            '',
            `Company document preview fallback (${uploadedDocsContext.usedCount}/${uploadedDocsContext.totalAvailable} docs included):`,
            uploadedDocsContext.context
          );
        }
        if (effectiveUseUploadedDocsContext && sharedReferenceContext.context) {
          systemLines.push(
            '',
            'Additional company shared reference library (organization-provided primary evidence):',
            '',
            `Shared reference context (${sharedReferenceContext.usedCount}/${sharedReferenceContext.totalAvailable} docs included):`,
            sharedReferenceContext.context
          );
        }
        if (companyProfileContext.hasAny) {
          systemLines.push(
            '',
            'Company profile context:',
            companyProfileContext.context
          );
        }
        if (effectiveForceCompanyContext) {
          systemLines.push(
            '',
            'Forced company-context mode is enabled.',
            'Treat uploaded manuals and company profile context as primary grounding for every answer.',
            'Tailor the response to this organization first, and clearly call out any gaps when the company context is incomplete.'
          );
        }
        const system = systemLines.join('\n');
        const response = await createClaudeMessage({
          model: DEFAULT_CLAUDE_MODEL,
          max_tokens: 960,
          temperature: 0.2,
          system,
          messages: messagesForApi,
        });
        const text = response.content
          .filter((block): block is { type: string; text?: string } => block.type === 'text')
          .map((block) => block.text || '')
          .join('\n')
          .trim();
        const reply = text || 'No response returned.';
        const dedupedRetrievedDocs: RetrievedDocRef[] = (() => {
          const seen = new Set<string>();
          const merged: RetrievedDocRef[] = [];
          for (const doc of [...retrievedFullDocContext.docs, ...retrievedPassageContext.docs]) {
            const key = doc.id || doc.name;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(doc);
          }
          return merged;
        })();
        const assistantMeta: AssistantTurnMeta = {
          routedAgents: routed.map((agent) => ({ id: String(agent.id), name: agent.name })),
          retrievedDocs: dedupedRetrievedDocs,
          passageCount: retrievedPassageContext.usedCount,
          docCount: retrievedPassageContext.docCount,
          fallback: fallbackUsed,
          manualRouting: splashAskAgentsManual,
        };
        setAgentChat((prev) => [
          ...prev,
          { role: 'user', content: trimmed },
          { role: 'assistant', content: reply, meta: assistantMeta },
        ]);
        setQuery('');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Agent answer failed.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

  };

  return (
    <div className="box-border flex w-full min-h-full flex-col px-3 py-5 sm:px-4 sm:py-7 md:px-8 md:py-9 lg:px-12 xl:px-16 2xl:px-24">
      <div className="mx-auto mt-1 mb-auto w-full min-w-0 max-w-[min(96vw,110rem)] sm:mt-2 md:mt-3">
        <div
          className={`rounded-2xl p-5 sm:p-7 md:p-8 lg:p-10 backdrop-blur ${
            isDarkMode
              ? 'border border-white/10 bg-navy-900/50'
              : 'border border-slate-200/90 bg-white/90 shadow-xl shadow-slate-300/35'
          }`}
        >
        <div className="text-center">
          <div className="mx-auto mb-3 sm:mb-4 flex h-14 w-14 sm:h-20 sm:w-20 lg:h-24 lg:w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sky-light shadow-lg shadow-sky/30">
            <svg className="h-10 w-10 sm:h-14 sm:w-14 lg:h-16 lg:w-16 text-white" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              {/* Nacelle / inlet lip */}
              <circle cx="32" cy="32" r="29" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2.5" />
              <circle cx="32" cy="32" r="26" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
              {/* Fan shroud shadow ring */}
              <circle cx="32" cy="32" r="23.5" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" />
              <g
                fill="currentColor"
                fillOpacity={0.9}
                className="animate-[spin_12s_linear_infinite]"
                style={{ transformOrigin: '32px 32px' }}
              >
                {/* 14 high-bypass-style fan blades: narrow at hub, wider at tip, slight sweep */}
                {Array.from({ length: 14 }, (_, i) => (
                  <path
                    key={i}
                    d="M32 21.8 Q34.5 16.8 35 11.4 L32 10.3 L29 11.4 Q29.5 16.8 32 21.8 Z"
                    transform={`rotate(${(360 / 14) * i} 32 32)`}
                  />
                ))}
              </g>
              {/* Blade root platform ring (static) */}
              <circle cx="32" cy="32" r="11.5" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" />
              {/* Spinner cone + hub */}
              <circle cx="32" cy="32" r="8.5" fill="currentColor" fillOpacity={0.35} />
              <circle cx="32" cy="32" r="6.2" fill="#0b1f3d" />
              <ellipse cx="32" cy="31" rx="3.2" ry="2" fill="currentColor" fillOpacity={0.45} />
            </svg>
          </div>
          <h1 className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-poppins font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>AeroGap</h1>
          <p className={`mt-1 text-sm font-semibold tracking-tight ${isDarkMode ? 'text-sky-light' : 'text-sky-700'}`}>Assistive Intelligence</p>
          <p className={`mt-2 text-xs ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>Not artificial intelligence.</p>
        </div>

        <form onSubmit={handleSearch} className="mt-6 sm:mt-8 space-y-3" autoComplete="off">
          <label htmlFor="splash-search" className="sr-only">
            Search AeroGap
          </label>
          <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
            <textarea
              ref={splashSearchRef}
              id="splash-search"
              name={user?.id ? `aerogap-splash-q-${user.id}` : 'aerogap-splash-q'}
              rows={1}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }}
              placeholder={agentChat.length ? 'Ask a follow-up…' : 'Ask a question or search pages…'}
              autoComplete="off"
              className={`w-full min-w-0 resize-none rounded-xl px-4 py-3 focus:outline-none md:min-h-[3rem] md:flex-1 md:basis-0 leading-normal ${
                isDarkMode
                  ? 'border border-white/15 bg-navy-800/70 text-white placeholder:text-white/40 focus:border-sky/60'
                  : 'border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-sky'
              }`}
            />
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full shrink-0 rounded-xl px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 md:w-auto ${
                isDarkMode
                  ? 'bg-sky hover:bg-sky-light'
                  : 'bg-sky-600 hover:bg-sky-700 shadow-sm shadow-sky-700/25'
              }`}
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>
        {target === 'agents' && splashDocPickerIds.length > 0 ? (
          <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${isDarkMode ? 'text-white/75' : 'text-slate-600'}`}>
            <span className="font-semibold uppercase tracking-wide">Focused on:</span>
            {splashDocPickerIds
              .map((id) => companyDocumentPickerOptions.find((doc) => doc.id === id))
              .filter((doc): doc is { id: Id<'documents'>; name: string; category: string } => Boolean(doc))
              .map((doc) => (
                <button
                  key={`focus-pill-${doc.id}`}
                  type="button"
                  onClick={() => toggleFocusedDocument(doc.id)}
                  className={`rounded-full border px-2 py-1 ${
                    isDarkMode
                      ? 'border-sky/35 bg-sky/15 text-sky-100 hover:bg-sky/25'
                      : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
                  }`}
                >
                  {doc.name} ×
                </button>
              ))}
            <button
              type="button"
              onClick={clearFocusedDocuments}
              className={`${isDarkMode ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-900'} underline underline-offset-2`}
            >
              Clear
            </button>
          </div>
        ) : null}
        {target === 'agents' && indexSummary && indexSummary.totalDocs > 0 && indexSummary.indexed < indexSummary.totalDocs ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
              isDarkMode
                ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowIndexHealth((prev) => !prev)}
                className="text-left font-semibold underline-offset-2 hover:underline"
                aria-expanded={showIndexHealth}
              >
                {indexSummary.indexed} of {indexSummary.totalDocs} manuals ready to search
                <span className="ml-1 text-[10px] opacity-80">{showIndexHealth ? '▴' : '▾'}</span>
              </button>
              <button
                type="button"
                onClick={handleManualReindex}
                disabled={isManualReindexing}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                  isDarkMode
                    ? 'border-white/25 bg-white/10 text-white hover:bg-white/15'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                }`}
              >
                {isManualReindexing ? 'Re-indexing…' : 'Re-index'}
              </button>
            </div>
            {showIndexHealth ? (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                {indexSummary.perDoc
                  .filter((doc) => doc.chunkCount === 0)
                  .slice(0, 50)
                  .map((doc) => (
                    <li key={doc.documentId} className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium">{doc.name}</span>
                      <span className="shrink-0 opacity-80">{doc.reason}</span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {target === 'agents' && !splashAskAgentsManual && (query.trim().length > 0 || agentChat.length > 0) && (
          <p className={`mt-3 text-xs ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
            Next message:{' '}
            <span className={isDarkMode ? 'text-white/85' : 'text-slate-700'}>{nextRosterNames}</span>
            {splashAskAgentPinnedIds.length > 0 && routedAgentsForAsk.length > suggestedAgents.length
              ? ` (includes ${splashAskAgentPinnedIds.length} pinned)`
              : null}
          </p>
        )}
        {hasEntityTypeContext && (
          <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
            Context: {entityTypeContext.labels.join(' | ')}
          </p>
        )}
        {target === 'agents' && uploadedDocsContext.totalAvailable > 0 && query.trim().length > 0 ? (
          <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
            Company documents: {effectiveUseUploadedDocsContext
              ? lastRetrievedPassageCount > 0
                ? `${lastRetrievedPassageCount} passages from ${lastRetrievedDocCount} docs`
                : usedFallbackContext
                  ? `fallback preview (${uploadedDocsContext.usedCount}/${uploadedDocsContext.totalAvailable} docs)`
                  : 'indexing / no matches yet'
              : `off (${uploadedDocsContext.totalAvailable} available)`}.
          </p>
        ) : null}
        {target === 'agents' && query.trim().length > 0 && sharedReferenceContext.totalAvailable > 0 ? (
          <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
            Shared reference library: {effectiveUseUploadedDocsContext
              ? `on (${sharedReferenceContext.usedCount}/${sharedReferenceContext.totalAvailable})`
              : `off (${sharedReferenceContext.totalAvailable} available)`}.
          </p>
        ) : null}
        {target === 'agents' && query.trim().length > 0 && (effectiveForceCompanyContext || companyProfileContext.hasAny) ? (
          <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
            Company profile context: {companyProfileContext.hasAny ? 'available' : 'not available'}{effectiveForceCompanyContext ? ' (forced)' : ''}.
          </p>
        ) : null}

        {query.trim().length > 0 && internalResults.length > 0 && internalResults.length < INTERNAL_DESTINATIONS.length ? (
          <button
            type="button"
            onClick={() => navigate(internalResults[0].path)}
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isDarkMode
                ? 'border-sky/30 bg-sky/10 text-sky-100 hover:bg-sky/20'
                : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
            }`}
          >
            Looking for a page? Go to {internalResults[0].label} →
          </button>
        ) : null}

        {(agentChat.length > 0 || isLoading) && (
          <div
            className={`mt-7 rounded-2xl p-5 ${
              isDarkMode
                ? 'border border-sky/30 bg-gradient-to-br from-sky/15 via-navy-800/40 to-navy-900/30 shadow-lg shadow-sky/10'
                : 'border border-sky/20 bg-gradient-to-br from-sky-50 via-white to-blue-50 shadow-lg shadow-slate-300/30'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-light">Conversation</p>
              <div className="flex flex-wrap items-center gap-2">
                {agentChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAgentChat([]);
                      setSplashAskAgentsManual(false);
                      setSplashAskAgentsPickedIds([]);
                      setSplashAskAgentPinnedIds([]);
                      setShowAgentSettings(false);
                    }}
                    className={`${chatUtilityButtonClass} shrink-0`}
                  >
                    New chat
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowAgentSettings((prev) => !prev)}
                  className={`${chatUtilityButtonClass} shrink-0`}
                >
                  {showAgentSettings ? 'Hide advanced' : 'Advanced'}
                </button>
                {agentChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={exportAgentAnswerPdf}
                    className={`${chatUtilityStrongButtonClass} shrink-0`}
                  >
                    Export PDF
                  </button>
                ) : null}
              </div>
            </div>
            {agentChat.length > 0 || isLoading ? (
              <>
                <ChatThread
                  turns={agentChat}
                  bottomRef={agentChatBottomRef}
                  isLoading={isLoading}
                  onOpenDoc={() => navigate('/library')}
                />
                {shouldOfferChecklist && agentResponse && isChecklistsEnabled ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-sm text-white/85">Create a checklist from the latest reply?</p>
                    <button
                      type="button"
                      onClick={handleCreateChecklistFromAnswer}
                      disabled={isCreatingChecklist}
                      className="rounded-lg bg-sky px-3 py-2 text-xs font-semibold text-white hover:bg-sky-light disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingChecklist ? 'Creating checklist...' : 'Create checklist'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/checklists')}
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
                    >
                      Open checklists
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className={`mt-2 text-sm ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>Ask a question to start.</p>
            )}

            {showAgentSettings ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4" role="region" aria-label="Advanced">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Advanced</p>
                <p className="mt-2 text-[11px] text-white/55">
                  Search uses your company documents, shared references, and auto-picked experts by default. Use these
                  controls to override routing or limit retrieval to specific documents.
                </p>

                <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Routing mode</p>
                    {!splashAskAgentsManual ? (
                      <button
                        type="button"
                        onClick={beginSplashManualExperts}
                        className="shrink-0 rounded-lg border border-sky/40 bg-sky/15 px-3 py-1.5 text-xs font-semibold text-sky-light hover:bg-sky/25"
                      >
                        Set experts manually…
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={endSplashManualExperts}
                        className="shrink-0 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
                      >
                        Use auto routing
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-white/60">
                    {splashAskAgentsManual ? 'Manual roster is active.' : 'Auto routing is active.'}
                  </p>
                </div>

                <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Experts for this thread</p>
                  <p className="mt-2 text-sm text-white/85">
                    <span className="text-white/60">Next message uses:</span>{' '}
                    <span className="font-medium text-white">{nextRosterNames}</span>
                  </p>
                  {!splashAskAgentsManual ? (
                    <>
                      <p className="mt-2 text-xs text-white/60">
                        Suggestions use your latest question plus recent chat context. Pin experts to always include (up to four total).
                      </p>
                      <p className="mt-2 text-sm text-white/75">
                        Auto-picked: <span className="font-medium text-white">{suggestedAgents.map((a) => a.name).join(', ') || '—'}</span>
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">Always include (optional)</p>
                        {splashAskAgentPinnedIds.length > 0 ? (
                          <button
                            type="button"
                            onClick={clearSplashAlwaysInclude}
                            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10"
                          >
                            Clear always-include
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid max-h-[min(35vh,400px)] grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden pr-1 sm:grid-cols-2 lg:grid-cols-3 [scrollbar-gutter:stable]">
                        {availableAgentsForAsk.map((agent) => {
                          const pinned = splashAskAgentPinnedIds.includes(agent.id);
                          const inSuggestions = suggestedIdSet.has(agent.id);
                          return (
                            <label
                              key={agent.id}
                              className={`flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10 ${pinned ? 'border-sky/35 bg-sky/10' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={pinned}
                                onChange={() => toggleSplashAlwaysInclude(agent.id)}
                                aria-label={`Always include ${agent.name} on every agent reply`}
                                className="mt-1 shrink-0 rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                              />
                              <span className="min-w-0 text-sm text-white/90">
                                <span className="font-medium text-white">{agent.name}</span>
                                {inSuggestions ? (
                                  <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-sky-light/90">
                                    Also suggested
                                  </span>
                                ) : null}
                                <span className="mt-0.5 block text-xs text-white/55 line-clamp-2">{agent.role}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-xs text-white/60">
                        Manual roster stays fixed until you switch back to auto.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={selectAllSplashAskExperts}
                          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10"
                        >
                          Check all
                        </button>
                        <button
                          type="button"
                          onClick={clearSplashAskExpertChecks}
                          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10"
                        >
                          Uncheck all
                        </button>
                      </div>
                      <div className="mt-3 grid max-h-[min(35vh,400px)] grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden pr-1 sm:grid-cols-2 lg:grid-cols-3 [scrollbar-gutter:stable]">
                        {availableAgentsForAsk.map((agent) => (
                          <label
                            key={agent.id}
                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10"
                          >
                            <input
                              type="checkbox"
                              checked={splashAskAgentsPickedIds.includes(agent.id)}
                              onChange={() => toggleSplashAskExpert(agent.id)}
                              className="mt-1 shrink-0 rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                            />
                            <span className="min-w-0 text-sm text-white/90">
                              <span className="font-medium text-white">{agent.name}</span>
                              <span className="mt-0.5 block text-xs text-white/55 line-clamp-2">{agent.role}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      {splashAskAgentsPickedIds.length === 0 ? (
                        <p className="mt-2 text-xs text-amber-200/90">Select at least one expert.</p>
                      ) : null}
                    </>
                  )}
                </div>

                {companyDocumentPickerOptions.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Focus retrieval on specific docs</p>
                      {splashDocPickerIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={clearFocusedDocuments}
                          className="text-[11px] font-semibold text-sky-200 hover:text-sky-100"
                        >
                          Clear selection
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[11px] text-white/55">
                      Leave empty to search all company documents. Selecting documents restricts retrieval to that subset only.
                    </p>
                    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-white/5 bg-white/[0.02] p-1.5">
                      {companyDocumentPickerOptions.map((doc) => {
                        const checked = splashDocPickerIds.includes(doc.id);
                        return (
                          <label
                            key={`doc-focus-${doc.id}`}
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs ${
                              checked ? 'bg-sky/15 text-sky-100' : 'text-white/80 hover:bg-white/5'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-white/25"
                              checked={checked}
                              onChange={() => toggleFocusedDocument(doc.id)}
                            />
                            <span className="truncate">{doc.name}</span>
                            <span className="ml-auto shrink-0 text-[10px] uppercase text-white/50">{categoryLabel(doc.category)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Chat history</p>
                  <p className="mt-2 text-[11px] text-white/55">
                    Saved Ask Agents chat: {savedAgentChatSnapshot.length} messages.{' '}
                    {savedAgentChatSnapshot.length > 0 ? previewChatTurn(savedAgentChatSnapshot) : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={loadSavedAgentChat}
                      disabled={savedAgentChatSnapshot.length === 0}
                      className="rounded-lg border border-sky/40 bg-sky/15 px-3 py-1.5 text-[11px] font-semibold text-sky-light hover:bg-sky/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Load saved chat
                    </button>
                    <button
                      type="button"
                      onClick={clearSavedChatHistory}
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/10"
                    >
                      Clear saved history
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
