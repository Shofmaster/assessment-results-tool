# Aviation Assessment Analyzer — Improvement Checklist

Each item is scoped to be completable in a single context window.
Mark items `[x]` as they are completed.

---

## Phase 1: Quick Wins (High Polish, Low Effort)

- [x] **1. Fix encoding bug in Sidebar**
  - File: `src/components/Sidebar.tsx`
  - The version string `v2.0.0 Â·` has a broken encoding. Fix to `v2.0.0 ·`
  - ~5 minutes

- [x] **2. Replace `alert()` calls with toast notifications**
  - Install `sonner` or `react-hot-toast`
  - Search all files for `alert(` and replace with toast calls
  - Add a `<Toaster />` provider in `App.tsx` or `main.tsx`
  - ~30 minutes

- [x] **3. Improve Suspense loading fallback**
  - File: `src/App.tsx`
  - Replace plain "Loading..." text with a centered spinner or skeleton
  - Match the app's navy/sky design language
  - ~30 minutes

- [x] **4. Move Google Fonts from CSS `@import` to `<link>` tags**
  - Move the `@import url(...)` from `src/index.css` to `<link>` tags in `index.html`
  - Add `rel="preconnect"` for `fonts.googleapis.com` and `fonts.gstatic.com`
  - ~10 minutes

- [x] **5. Add favicon and OG meta tags**
  - Add a favicon (aviation-themed) to `public/`
  - Add `<meta property="og:...">` tags in `index.html`
  - ~15 minutes

- [x] **6. Add `prefers-reduced-motion` support**
  - In `src/index.css`, add a `@media (prefers-reduced-motion: reduce)` block
  - Disable `transition`, `animation`, and `hover:scale-*` transforms
  - ~20 minutes

---

## Phase 2: Core UX Improvements

- [x] **7. Replace Zustand view-routing with React Router**
  - Install `react-router-dom`
  - Define routes: `/`, `/library`, `/analysis`, `/audit`, `/revisions`, `/projects`, `/settings`, `/admin`
  - Nest under `/projects/:projectId/` for project-scoped views
  - Update `Sidebar.tsx` to use `<NavLink>` instead of `setCurrentView()`
  - Update `App.tsx` to use `<Routes>` and `<Outlet>`
  - Remove `currentView` / `setCurrentView` from `appStore.ts`
  - Preserve lazy loading with `React.lazy` or router-based lazy
  - ~2-3 hours

- [ ] **8. Extract reusable component library**
  - Create `src/components/ui/` directory
  - Extract: `Button` (primary, secondary, destructive, ghost variants + sizes)
  - Extract: `Card` / `GlassCard` (replace inline `glass rounded-2xl p-6` pattern)
  - Extract: `Input`, `Select`, `Badge`, `Spinner`
  - Refactor existing components to use the new primitives
  - ~2-3 hours

- [x] **9. Add Error Boundaries**
  - Create `src/components/ErrorBoundary.tsx`
  - Wrap each major view in `App.tsx` with an error boundary
  - Show a recovery UI with "Try Again" button
  - ~1 hour

- [x] **10. Add keyboard shortcuts**
  - Add `Ctrl+1` through `Ctrl+7` for view navigation
  - Add `Ctrl+K` for a command palette (optional, stretch goal)
  - Use `useEffect` with `keydown` listener or a library like `react-hotkeys-hook`
  - ~1 hour

---

## Phase 3: Accessibility

- [x] **11. Add skip navigation link**
  - Add a visually hidden "Skip to main content" link as the first focusable element
  - Link target: `<main id="main-content">`
  - Style to become visible on `:focus`
  - ~20 minutes

- [x] **12. Add focus management on view transitions**
  - When the view changes, move focus to the heading of the new view
  - Use a `ref` + `useEffect` pattern
  - ~30 minutes

- [x] **13. Add custom `:focus-visible` ring styles**
  - In `tailwind.config.js` or `index.css`, add a visible focus ring for dark backgrounds
  - e.g., `focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900`
  - Apply globally or via a Tailwind plugin
  - ~30 minutes

- [x] **14. Audit and fix color contrast**
  - Check `text-white/40` and `text-white/60` against navy backgrounds with a contrast checker
  - Increase opacity or adjust colors to meet WCAG AA (4.5:1 for normal text)
  - ~1 hour

- [ ] **15. Add `aria-live` regions for async status updates**
  - Analysis progress, simulation status, and form errors should announce to screen readers
  - Add `aria-live="polite"` to status text areas
  - Add `aria-describedby` to form fields with errors
  - ~1 hour

---

## Phase 4: Data Visualization

- [ ] **16. Add compliance score gauge/donut chart**
  - Install `recharts` (lightweight, React-native)
  - Add a radial/donut chart to Dashboard and AnalysisView for overall compliance %
  - Color-code: green (>80%), amber (60-80%), red (<60%)
  - ~1-2 hours

- [ ] **17. Add gap breakdown bar chart**
  - Bar chart showing critical/major/minor gap counts
  - Display in Dashboard "Latest Analysis" section and AnalysisView
  - ~1 hour

- [ ] **18. Add multi-framework radar chart**
  - Radar/spider chart comparing compliance across Part 145, IS-BAO, EASA, AS9100
  - Display in AnalysisView when multi-framework data is available
  - ~1-2 hours

- [ ] **19. Replace emoji empty states with SVG illustrations**
  - Replace `📁`, `🚀` with custom or open-source SVG illustrations
  - Match the navy/sky color palette
  - Consider https://undraw.co or https://storyset.com for free options
  - ~1 hour

---

## Phase 5: AI Architecture — Streaming & Cost Controls

- [ ] **20. Implement streaming Claude responses**
  - Update `api/claude.ts` to use Anthropic streaming API
  - Return Server-Sent Events (SSE) to the frontend
  - Update `claudeProxy.ts` to consume the stream with `EventSource` or `fetch` + `ReadableStream`
  - Show tokens arriving in real-time in AnalysisView and AuditSimulation chat
  - ~3-4 hours

- [ ] **21. Add token usage tracking and cost estimation**
  - Track `input_tokens` and `output_tokens` from Claude responses
  - Store per-request usage in Convex (new `apiUsage` table or extend `analyses`/`simulationResults`)
  - Display cumulative usage in Settings or a new Usage dashboard
  - Add cost estimation based on Anthropic pricing
  - ~2-3 hours

- [ ] **22. Add rate limiting and request queuing**
  - Server-side: add per-user rate limiting to `api/claude.ts`
  - Client-side: disable buttons during active requests, add debouncing
  - Add a request queue for audit simulation rounds (sequential by design, but prevent duplicates)
  - ~1-2 hours

---

## Phase 6: AI Architecture — RAG & Document Intelligence

- [ ] **23. Implement document chunking on upload**
  - When documents are uploaded and text is extracted, split into semantic chunks (500-1000 tokens each)
  - Store chunks in a new `documentChunks` Convex table with metadata (docId, chunkIndex, text)
  - Preserve section headings and paragraph boundaries
  - ~2-3 hours

- [ ] **24. Add vector embeddings and search**
  - Generate embeddings for each document chunk (via Anthropic or OpenAI embeddings API)
  - Store embeddings in Convex vector search index
  - Build a `searchDocuments(query, topK)` function that returns the most relevant chunks
  - ~3-4 hours

- [ ] **25. Integrate RAG into analysis and audit agents**
  - Replace the current truncated-document approach with RAG retrieval
  - For each agent turn, retrieve top-K relevant document chunks based on the agent's role and current question
  - Pass retrieved chunks as context instead of full documents truncated at 5000 chars
  - ~2-3 hours

- [ ] **26. Add Anthropic prompt caching**
  - Add `cache_control` blocks to system prompts and assessment data
  - Cache the static parts (regulatory framework, agent identity) across turns
  - This reduces token costs and latency significantly for multi-turn simulations
  - ~1-2 hours

---

## Phase 7: AI Quality & Reliability

- [ ] **27. Add structured output validation with Zod**
  - Install `zod`
  - Define Zod schemas for: `Finding`, `Recommendation`, `ComplianceStatus`, `DocumentAnalysis`
  - Validate all parsed Claude JSON responses
  - Add retry logic (up to 2 retries) on parse failure with error feedback to the model
  - ~2 hours

- [ ] **28. Add confidence scores to AI outputs**
  - Update analysis prompts to request confidence levels (high/medium/low) per finding
  - Update TypeScript types and UI to display confidence badges
  - Flag low-confidence findings for human review
  - ~1-2 hours

- [ ] **29. Add agent memory / cross-session findings**
  - Create a `findingsHistory` Convex table to store key findings per organization
  - When running a new analysis, retrieve prior findings and include as context
  - Show trends (improving/regressing/stable) in the UI
  - ~2-3 hours

---

## Phase 8: TypeScript & Code Quality

- [ ] **30. Eliminate `as any` type casts**
  - Update `useConvexData.ts` hooks to return properly typed data
  - Use Convex generated types (`Doc<"projects">`, `Doc<"assessments">`, etc.)
  - Remove all `as any` and `as any[]` casts from component files
  - Fix any resulting type errors
  - ~2-3 hours

- [ ] **31. Add print stylesheet**
  - Add `@media print` styles in `index.css`
  - Hide sidebar, navigation, and action buttons
  - Ensure analysis results and compliance data print cleanly
  - ~1 hour

---

## Phase 9: Testing

- [ ] **32. Set up testing infrastructure**
  - Install Vitest + React Testing Library
  - Configure `vitest.config.ts`
  - Add test scripts to `package.json`
  - Write 1 smoke test to verify setup works
  - ~1 hour

- [ ] **33. Add unit tests for AI response parsing**
  - Test `parseAnalysisResponse` in `claudeApi.ts`
  - Test with valid JSON, malformed JSON, partial responses
  - Test compliance score calculations
  - ~1-2 hours

- [ ] **34. Add unit tests for document extraction**
  - Test `documentExtractor.ts` with sample PDF, DOCX, and text files
  - Test edge cases: empty files, corrupted files, very large files
  - ~1-2 hours

- [ ] **35. Add E2E tests for critical user flows**
  - Install Playwright
  - Test: sign in → create project → import assessment → view dashboard
  - Test: navigate between views, project switching
  - ~2-3 hours

---

## Phase 10: Stretch Goals

- [ ] **36. Add a "What's New" changelog modal**
  - Show on first visit after an update
  - Track last-seen version in `userSettings`
  - ~1 hour

- [ ] **37. Add dark/light theme toggle**
  - Extend Tailwind config with light theme colors
  - Add toggle in Settings
  - Store preference in `userSettings`
  - ~3-4 hours

- [ ] **38. Add a command palette (Ctrl+K)**
  - Install `cmdk` (Command Menu for React)
  - Index all views, projects, and recent analyses
  - ~2 hours

- [ ] **39. Optimize bundle size**
  - Lazy-load `pdfjs-dist`, `docx`, `mammoth` only when needed
  - Analyze bundle with `rollup-plugin-visualizer`
  - Target: main chunk under 500KB
  - ~1-2 hours

---

## Progress Tracker

| Phase | Items | Completed |
|-------|-------|-----------|
| 1. Quick Wins | 6 | 6 |
| 2. Core UX | 4 | 3 |
| 3. Accessibility | 5 | 4 |
| 4. Data Visualization | 4 | 0 |
| 5. AI Streaming & Costs | 3 | 0 |
| 6. AI RAG & Docs | 4 | 0 |
| 7. AI Quality | 3 | 0 |
| 8. Code Quality | 2 | 0 |
| 9. Testing | 4 | 0 |
| 10. Stretch Goals | 4 | 0 |
| **Total** | **39** | **13** |
