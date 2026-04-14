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

## Steps

1. Configure personal model and integration settings in `/settings`.
2. Validate role-specific access before entering `/admin`.
3. In admin, select the target user or company scope first.
4. Apply feature toggles, role changes, or KB/reference updates.
5. Save and verify changes in affected workflow pages.

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

## Troubleshooting

- `/admin` not visible: current user is not admin.
- Toggle save blocked: no target user selected.
- Upload failures: file size/type/network errors during generated upload URL usage.

## Related guides and next step

- Related: [App Navigation and Access](./app-navigation-and-access.md), [Issues, Command Center, and Analytics](./issues-command-center-and-analytics.md)
- Next step: Re-test one user workflow after policy updates to confirm permissions and visibility are correct.
