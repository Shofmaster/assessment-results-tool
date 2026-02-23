# Ready to build — Auditor skills and AdminPanel

Use this document in a **new context window** to execute the remaining work. All skill content is in the main plan file; this file is the checklist and context summary.

## Plan file (source of SKILL.md content)

- **Main plan**: [auditor_skill.md_files_8a2c38d6.plan.md](auditor_skill.md_files_8a2c38d6.plan.md) in this folder (or `~/.cursor/plans/`). It contains all **11 filled-in SKILL.md drafts** (fenced code blocks). Copy the **inner markdown** from each block into the corresponding `.cursor/skills/<id>/SKILL.md`.

## Already done in code (no action needed)

- **Types**: [src/types/auditSimulation.ts](src/types/auditSimulation.ts) — `AuditAgent['id']` includes `dom-maintenance-manager`, `chief-inspector-quality-manager`, `entity-safety-manager`, `general-manager`, `audit-host`.
- **AUDIT_AGENTS**: [src/services/auditAgents.ts](src/services/auditAgents.ts) — 11 selectable agents; 4 entity personas; host messages use `audit-host`.
- **Builders**: Same file — `buildDOMSystemPrompt`, `buildChiefInspectorQualityManagerSystemPrompt`, `buildEntitySafetyManagerSystemPrompt`, `buildGeneralManagerSystemPrompt`; shared entity docs via `buildEntityPersonaContext`.
- **getSystemPrompt**, **allAgents**, **ComparisonView**, **auditPdfGenerator**, **auditDocxGenerator**: Updated for 4 entity personas and audit-host.

## Build checklist

### 1. Create 11 Cursor skills

- Create directory: **`.cursor/skills/`** in the repo root (`aviationassessment`).
- For each agent id below, create **`.cursor/skills/<id>/SKILL.md`**.
- **Content**: Open the main plan file; find the section for that id (e.g. "### 1. faa-inspector"); copy **only the markdown inside** the fenced block (do not include the line with ```markdown or the closing ```). Paste into the new `SKILL.md`.

**Agent ids (11 total):**

- `faa-inspector`
- `shop-owner`
- `dom-maintenance-manager`
- `chief-inspector-quality-manager`
- `entity-safety-manager`
- `general-manager`
- `isbao-auditor`
- `easa-inspector`
- `as9100-auditor`
- `sms-consultant`
- `safety-auditor`

**Sections in the plan:** Drafts 1 and 2; then 3a, 3b, 3c, 3d (entity personas); then 4, 5, 6, 7, 8.

### 2. Add 4 entity personas to AdminPanel

- File: [src/components/AdminPanel.tsx](src/components/AdminPanel.tsx).
- Find the **`AGENT_TYPES`** array (around line 31). Add these four entries **after** `shop-owner` and **before** `isbao-auditor`:

```ts
  { id: 'dom-maintenance-manager', name: 'DOM / Maintenance Manager', color: 'text-slate-400' },
  { id: 'chief-inspector-quality-manager', name: 'Chief Inspector / Quality Manager', color: 'text-slate-500' },
  { id: 'entity-safety-manager', name: 'Safety Manager', color: 'text-teal-400' },
  { id: 'general-manager', name: 'General Manager', color: 'text-slate-300' },
```

- Result: `AGENT_TYPES` has 11 entries; Knowledge Base and "Assign Files to Agent" modal show all 11 agents.

### 3. Optional — Sync app prompts and Chad

- **Entity persona builders** in [src/services/auditAgents.ts](src/services/auditAgents.ts): Optionally update the four builder functions so their system prompt text matches the finalized plan (e.g. DOM may discuss compliance; Chief Inspector may cite regulations, more direct; Safety Manager may cite FARs/data from data pool only; General Manager relies on DOM/Chief Inspector, not into the audit, always named Chad).
- **General Manager name**: In `AUDIT_AGENTS`, change the `general-manager` entry to `name: 'Chad'` or `name: 'Chad (General Manager)'` if you want the UI to show "Chad."

## Summary

- **To build**: (1) Create 11 skill directories and SKILL.md files from the plan drafts; (2) Add 4 entries to `AGENT_TYPES` in AdminPanel.
- **Optional**: Sync entity persona prompts and set GM display name to Chad.
- **Single source of truth for skill content**: The main plan file `auditor_skill.md_files_8a2c38d6.plan.md`.
