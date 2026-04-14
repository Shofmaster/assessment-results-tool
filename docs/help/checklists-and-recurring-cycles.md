# Checklists and Recurring Cycles

Route: `/checklists`  
Component: `src/components/Checklists.tsx`  
Primary backend: `convex/auditChecklists.ts`, `convex/checklistSeries.ts`

## What this page does

Checklists manages generated checklist runs, item-level execution, issue escalation, and recurring cycle scheduling.

## Main user actions

1. Create checklist run from selected documents.
2. Update status, notes, owner, requirement reference, and due date per item.
3. Escalate checklist items to CAR/issues.
4. Remove items or entire runs.
5. Link checklist runs to recurring series and update planned cycle dates.
6. Print/export run history.

## Key functions and behavior

- `createRunFromSelectedDocs(...)`  
  Creates a new checklist run from chosen source documents.
- `updateItemStatus(itemId, status)`  
  Updates execution status for a checklist item.
- `updateItemNotes(itemId)` / `updateItemOwner(itemId)` / `updateItemDueDate(itemId)` / `updateItemRequirementRef(itemId)`  
  Writes field-level item updates back to persistence layer.
- `escalateItem(itemId)`  
  Escalates checklist item as CAR/issue.
- `removeItem(itemId)` / `removeRun()`  
  Deletes a single checklist item or full run.
- `createSeriesAndLinkRun(...)` / `updateOpenOccurrencePlannedDue(...)`  
  Connects run to recurring schedule and updates open occurrence dates.
- `handlePrint()`  
  Opens print/export path for checklist output.

## Common failure states

- No selected run: item-level actions are unavailable.
- Execution lock: protected states prevent destructive edits.
- Missing project context: run creation and updates are blocked.
