# Settings and Admin

Routes:
- `/settings` (`Settings`)
- `/admin` (`AdminPanel`, admin-only)

Primary backend:
- `convex/userSettings.ts`
- `convex/users.ts`
- `convex/companies.ts`
- `convex/sharedAgentDocuments.ts`
- `convex/sharedReferenceDocuments.ts`

## What these pages do

- `Settings`: Personal preferences, model selections, and API integration fields.
- `AdminPanel`: Platform/company governance for users, roles, toggles, and shared libraries.

## Key functions and behavior

### Settings (`src/components/Settings.tsx`)

- `handleAIModelSave(settingKey, value)`  
  Saves model preference changes (analysis/audit/review/DCT profiles).
- `handleGoogleSave()`  
  Persists Google integration credentials in user settings.
- `setPreference('light' | 'dark' | 'system')`  
  Updates visual theme preference.

### Admin panel (`src/components/AdminPanel.tsx`)

- `setRole(...)` / `setLogbookEntitlement(...)`  
  Controls user role and module entitlement.
- `handleSelectToggleUser(userId)` / `handleSaveToggles()`  
  Loads and persists per-user feature/agent/framework toggles.
- `toggleAgent(agentId)` / `toggleFramework(framework)`  
  Changes local draft toggle state.
- `handleFileUpload(agentId, files)` / `handleDownloadDoc(doc)` / `handleDeleteDoc(docId)`  
  Manage shared agent knowledge-base files.
- `handleRefFileUpload(typeId, files)` / `handleDownloadRefDoc(doc)` / `handleDeleteRefDoc(docId)`  
  Manage shared reference document libraries.
- `handleLibraryImport(category, files)` / `handleLibraryDelete(docId)`  
  Imports and removes company/project library docs.
- `handleGenerateMemory()`  
  Triggers memory generation workflow for assistant knowledge maintenance.
- `handleAddKbDocAsProjectReference(kbDoc)`  
  Copies selected KB assets into project reference context.

## Common failure states

- `/admin` not visible: current user is not admin.
- Toggle save blocked: no target user selected.
- Upload failures: file size/type/network errors during generated upload URL usage.
