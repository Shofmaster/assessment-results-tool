# Reintroduce Features Checklist (Non–AI-Model)

Use this list to bring back or confirm any feature that was affected after the “multiple AI models” work, **excluding** anything that only concerns which AI model or provider is used.

---

## How to use

- **Verify** = test in the app; if it works, check the box.
- **Reintroduce** = the code or UI was removed or broken; restore it and then check the box.
- Skip anything that is only about AI model/provider selection or API keys.

---

## 1. Google Drive import

- [ ] **Library: Import from Google Drive**
  - **Verify:** Library → “Import from Google Drive” (or “Set Up Google Drive”) opens the picker and adds files.
  - **Reintroduce if:** Button is missing or does nothing. Ensure `GoogleDriveImport.tsx` is rendered in `LibraryManager.tsx` and that Settings has a place to store Drive credentials (Convex or env).

- [ ] **Admin: Import from Drive for agents**
  - **Verify:** Admin → Audit agents → “Import from Drive” on an agent works.
  - **Reintroduce if:** Button missing or broken. `AdminPanel.tsx` uses `GoogleDriveService`; ensure credentials are available (e.g. from user settings in Convex).

- [ ] **Settings: Google Drive credentials**
  - **Verify:** Settings → “Google Drive Import” / “Google Drive Setup” lets you save client ID and secret (or whatever the app expects) and they persist (e.g. in Convex user settings).
  - **Reintroduce if:** Section was removed or no longer saves/loads.

---

## 2. Audit Simulation export (DOCX / PDF)

- [ ] **Export Audit Simulation as DOCX**
  - **Verify:** Audit Simulation view has an “Export DOCX” (or “Download report DOCX”) action that downloads a Word file.
  - **Reintroduce if:** No export button. `AuditSimulationDOCXGenerator` exists in `src/services/auditDocxGenerator.ts`; wire it in `AuditSimulation.tsx` (e.g. button that builds messages/agents and calls the generator, then triggers download).

- [ ] **Export Audit Simulation as PDF**
  - **Verify:** Audit Simulation has an “Export PDF” (or “Download report PDF”) action that downloads a PDF.
  - **Reintroduce if:** No export button. `AuditSimulationPDFGenerator` exists in `src/services/auditPdfGenerator.ts`; wire it in `AuditSimulation.tsx` the same way as DOCX.

---

## 3. Migration / onboarding

- [ ] **Migration banner (legacy data)**
  - **Verify:** If you still need to migrate old localStorage data to Convex, the migration banner appears and the flow works.
  - **Reintroduce if:** Banner or migration logic was removed but you still have users on the old format. See `MigrationBanner.tsx`.

- [ ] **First-time / empty state**
  - **Verify:** Empty states (e.g. no projects, no library docs) show clear copy and actions (e.g. “Create project”, “Import from Drive”).
  - **Reintroduce if:** Copy or buttons were removed during refactors.

---

## 4. Other non-AI flows (smoke check)

- [ ] **Revision tracker**
  - **Verify:** Revisions view loads, shows revision data, and any “check” or “refresh” actions work (no dependency on a specific AI model; may still call AI for checks—that’s separate).

- [ ] **Comparison view**
  - **Verify:** Document comparison (e.g. compare two docs) runs and shows results. If it uses AI, only confirm the feature runs; don’t change model/provider here.

- [ ] **Library: upload and file types**
  - **Verify:** Upload (drag-and-drop or file picker) works for the intended types (e.g. PDF, DOC, DOCX, TXT). No regression in accepted types.

- [ ] **Projects and assessments**
  - **Verify:** Create/edit project, add assessment, open analysis. No dependency on AI model config; just that the flows and Convex calls work.

- [ ] **Admin: agent docs and shared docs**
  - **Verify:** Upload/import docs per agent, manage shared reference docs. No AI model logic; just CRUD and listing.

---

## 5. Types and dead code (optional)

- [ ] **userSession / UserSession type**
  - **Reintroduce if:** Something (e.g. preferences, session flags) used to rely on `userSession` and was removed. Restore the type in `src/types/` and any minimal usage; keep it non-AI (no model selection).

- [ ] **Unused exports**
  - **Optional:** If `auditDocxGenerator` or `auditPdfGenerator` are never imported, either wire them (see section 2) or leave as-is until you’re ready to add export.

---

## Notes

- **AI model / provider:** Do **not** use this checklist to change which model or provider is used, or to fix API keys. Use Settings and HOW_AI_WORKS.md / BACKEND_VARIABLES_REFERENCE.md for that.
- **Convex auth:** If you see “A server error has occurred” / FUNCTION_INVOCATION_FAILED, that’s Convex auth (e.g. `CLERK_JWT_ISSUER_DOMAIN`). See FIX_SERVER_ERROR_STEPS.md; that’s not “reintroducing a feature” here.
- Mark items `[x]` when done and add a short note (e.g. “Wired DOCX export in AuditSimulation”) if useful for future you.
