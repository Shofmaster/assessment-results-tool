# Ask an Expert — verifiable citations upgrade

**Status:** Phases 1 and 2 implemented (2026-06-10) — pending manual QA and production Convex deploy.

**Phase 2 implementation notes (what shipped):** record tools via the existing `/api/claude`
tool-use path — `RECORD_TOOLS` definitions + client-side executor in
`src/services/askRecordTools.ts` (each result row carries a `cite` tag; matching
`AskRecordSource` entries returned per row), slim access-controlled queries in
`convex/askTools.ts` (aircraft status, logbook entries with filters, installed components,
discrepancies), `list_upcoming_due` reusing `dueForecast.sourcesForProject` + the client engine.
SplashPage runs a bounded loop (`MAX_RECORD_TOOL_CALLS = 6`) replaying `tool_use`/`tool_result`
blocks; tools attach only when `FEATURE_KEYS.ASK_RECORD_TOOLS` + `ASK_CITATIONS` are on AND the
project has aircraft. Record tags continue numbering after retrieval sources; only *cited*
record sources persist on the turn. Record chips deep-link (`/logbook`, `/fleet`, `/schedule`)
instead of opening the text modal.
Decisions locked: feature name "Ask an Expert"; this plan covers **Phase 1 (verifiable
citations) only**; uncited grounded answers get a **subtle notice**; next feature after this
ships is **due-list forecasting** (see `due-list-forecast-spec.md`).

**Implementation notes (what shipped):** `documentChunks.search` returns `chunkId`/`startChar`/
`endChar`; `documents.getTextSlice` action (offsets resolved against shared
`convex/_textUtils.normalizeText`); `src/types/askSources.ts` (`AskSource`,
`segmentAnswerWithCitations`, unit-tested); SplashPage tags passages `[S1]…` and full docs,
swaps the prompt instruction, persists `sources` per assistant turn (normalized on load);
citation chips render via `renderInlineMarkdown` (unknown tags stripped), `AskSourcesPanel`
shows cited rows + "Also searched N more" + the subtle uncited notice;
`src/components/ask/AskSourceModal.tsx` shows the highlighted span. Gated by
`FEATURE_KEYS.ASK_CITATIONS` (default-on per allowlist semantics; admins can withhold).
UI copy renamed to "Ask an Expert" in Settings, CompanyAdminPanel, and PDF export labels.

**Competitive driver:** Bluetail's June 2026 "Ask Bluetail" — natural-language Q&A over aircraft
records with answers linked to source records. AeroGap's splash-page Ask Agents chat already has
multi-agent routing and RAG retrieval over `documentChunks`; what's missing is what customers can
*see*: clickable citations that provably map to retrieved text. Later phases (structured-records
tools, Library/Fleet embedding) are sketched in §6 and get their own plans after Phase 1 ships.

---

## 1. Current state (verified in code)

- Retrieval: `documentChunks.search` action ([convex/documentChunks.ts:967](../convex/documentChunks.ts))
  — project/company scope, focused-doc + category filters, optional full-document hydration.
  Chunk rows store `startChar`/`endChar` but the action does **not** return them.
- Chat: splash page `SplashPage.tsx` calls the search (~line 1949), formats context via
  `buildRetrievedPassageContext` (~line 827: `### docName (passage x/y)` headings), and instructs
  the model to write a free-text `## Sources` markdown section (~line 2002), parsed by
  `parseSourcesSection` (~line 265). Nothing verifies those citations exist.
- Grounding has two modes: passage chunks (default) and full-document context
  (`includeFullDocuments`, ~line 2019) — the plan must tag both.
- Chats persist per-user in localStorage (draft schema in SplashPage, ~lines 1280–1400).
- UI copy currently says "Ask Agents" (SplashPage, `Settings.tsx` ~line 289,
  `CompanyAdminPanel.tsx` ~line 791).

## 2. Goal & non-goals

**Goal:** every grounded claim carries an inline tag that maps to a real retrieved chunk or
document; clicking it shows the exact source text; model-invented tags can never render as links;
grounded answers with zero citations are flagged with a subtle notice.

**Non-goals (this plan):** structured-records tool use, lifecycle timeline, Library/Fleet ask
panels, cross-device thread persistence.

**Latency note:** Ask answers stream tokens when record tools are off; Voyage rerank is skipped on
the Ask hot path (`allowRerank: false`) so hybrid fusion order is used directly.

## 3. Implementation plan

### Milestone 0 — backend + types (~0.5 day)

1. **`documentChunks.search` payload** ([convex/documentChunks.ts:1046](../convex/documentChunks.ts)):
   add `chunkId: row._id`, `startChar`, `endChar` to `mappedChunks`. Two-line change; all existing
   callers (AuditSimulation, GuidedAudit, DCT hooks) ignore extra fields.
2. **`documents.getTextSlice`** — new Convex **action** (it fetches storage content, so not a
   query): `{ documentId, startChar, endChar, padding = 1500 }` → `{ before, span, after,
   docName, category }`. Reuse the `resolveDocumentText` pattern from documentChunks.ts; enforce
   access by calling `api.documents.get` first; clamp offsets to text length.
3. **`src/types/askSources.ts`**:
   ```ts
   export type AskSource =
     | { tag: string; kind: 'chunk'; documentId: string; chunkId: string; docName: string;
         category: string; chunkIndex: number; totalChunks: number;
         startChar: number; endChar: number; score: number; excerpt: string }
     | { tag: string; kind: 'document'; documentId: string; docName: string; category: string };
   ```
   `kind: 'document'` covers full-document grounding mode (no span to highlight — modal opens at
   the top; phase 2 will add `kind: 'record'`).

### Milestone 1 — tagged retrieval context (~0.5 day)

4. In the splash ask handler, build `AskSource[]` from search results (tags `S1…Sn`, chunks first,
   then full documents). Change `buildRetrievedPassageContext` headings from
   `### docName (passage x/y)` to `[S1] docName (passage x/y) — category`, and prefix each full
   document in `buildRetrievedFullDocumentContext` with its `[Sn]` tag.
5. Replace the `## Sources` instruction (SplashPage.tsx:2002) with:
   > When you rely on a provided source excerpt or document, cite it inline using its bracket tag,
   > e.g. "Tooling must be calibrated annually [S1][S3]." Only use tags that appear in the
   > provided sources. If you answer from general knowledge or cite a regulation not in the
   > sources, name it in prose without a tag. Do not produce a separate Sources section.
   Keep the regulatory-prose-citation line (2001) unchanged. When grounding is off or retrieval
   returned nothing, keep the current instruction set (no tags exist to cite).
6. Persist `sources: AskSource[]` on each assistant turn in the localStorage draft schema.
   Backward compat: turns without `sources` render exactly as today (no chips, no notice).
   Multi-turn rule: tags are **per turn** — each question re-tags from S1, and only the current
   turn's sources validate its citations (prior turns keep their own arrays).

### Milestone 2 — rendering + source viewer (~1 day)

7. **`src/components/ask/CitationText.tsx`** — renders answer markdown, replacing `\[S(\d+)\]`:
   tag in this turn's sources → superscript chip; unknown tag → stripped silently. Retain
   `stripMarkdownSourcesSection` as cleanup for models that still emit the old section.
8. **Sources panel** under each answer: one row per *cited* source (doc name, category badge,
   excerpt, score); uncited retrieved chunks collapse under "Also searched: N more".
9. **Subtle notice** (decision: not a warning banner): when grounding was on, retrieval returned
   sources, and the answer contains zero valid tags →
   *"This answer does not cite your documents — treat as general guidance."* Muted text under the
   answer, same styling tier as the existing fallback-context hint.
10. **`src/components/ask/AskSourceModal.tsx`** — chunk chips open it: calls `getTextSlice`,
    renders `before + <mark>span</mark> + after` auto-scrolled to the mark; footer "Open in
    Library" navigates to the document (publication viewer for technical-library categories,
    Library otherwise). Document-kind chips open at the top with no mark.

### Milestone 3 — naming, flag, tests (~0.5–1 day)

11. **Rename user-facing copy** "Ask Agents" → "Ask an Expert": splash heading/placeholders,
    `Settings.tsx` "Ask Agents defaults" card, `CompanyAdminPanel.tsx` context-policy copy, Help
    Center mentions. Internal identifiers (`splashAskAgents*`, `askAgentRouting.ts`) stay — a
    rename there is churn with no user value.
12. **Feature flag** `FEATURE_KEYS.ASK_CITATIONS` (per-user pattern, `featureKeys.ts`): OFF keeps
    today's prompt + rendering; ON enables tags/chips/notice. Stage rollout AeroGap employees →
    all, per the `auditorCoverageRollout.ts` convention.
13. **Tests** (patterns in `src/__tests__/`):
    - tag regex: valid, unknown, adjacent `[S1][S2]`, inside code spans, `[S01]`/malformed;
    - source mapping round-trip incl. document-kind and per-turn isolation;
    - `getTextSlice` bounds: span at start/end of doc, padding overlap, out-of-range clamps;
    - notice logic: grounding off / retrieval empty / cited / uncited matrix.
14. **Manual QA:** 10 questions against the demo company (5 doc-grounded, 5 general); verify every
    chip opens the right highlighted span and the notice appears only for the uncited grounded case.

### Estimate & sequencing

~2.5–3 days. Ship order: M0 → M1 behind the flag → M2 → M3 rollout. No schema migration; no
`/api` changes.

## 4. Risks

- **Wrong-tag citations:** the model may cite a real-but-irrelevant tag. The excerpt in the
  sources panel makes this visible at a glance; acceptable parity with Ask Bluetail.
- **Prompt regression for ungrounded chats:** mitigated by leaving the no-retrieval prompt path
  untouched and gating everything behind the flag.
- **localStorage draft schema drift:** additive field only; parser already tolerates missing keys.

## 5. Success criteria

- ≥90% of grounded answers in QA carry ≥1 valid citation chip.
- Zero rendered citations that fail to resolve to a source (guard guarantees this by construction).
- No change in answer quality/latency for ungrounded questions with the flag on.

## 6. Later phases (separate plans after Phase 1 ships)

- **Phase 2 — records-aware answers:** tool use through `/api/chat` (already forwards `tools`):
  `search_documents`, `get_aircraft_status`, `list_logbook_entries`, `get_component_status`,
  `list_discrepancies`, `list_upcoming_due` (backed by the due-list forecast). `kind: 'record'`
  sources deep-link to logbook/fleet/schedule views. Bounded loop (max 6 calls) + spend caps per
  `dctSpendLimits` pattern.
- **Phase 3 — surfacing:** extract the splash chat into `ask/AskPanel.tsx`; embed in
  CompanyLibrary (scoped to open folder/doc) and FleetView (scoped per tail).
