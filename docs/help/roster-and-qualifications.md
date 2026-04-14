# Roster and Qualifications

Route: `/roster`  
Component: `src/components/Roster.tsx`  
Primary backend: `convex/roster.ts`, `convex/rosterDueDates.ts`

## What this page does

Roster tracks qualification requirement types, personnel records, assignments, and completion status for due-date visibility.

## Main user actions

1. Add requirement types.
2. Add personnel.
3. Create requirement-to-person assignments.
4. Update requirement/person/assignment details.
5. Record completion events.
6. Delete assignments, requirements, or personnel.

## Key functions and behavior

- `handleAddRequirement()`  
  Creates a new requirement type in project roster data.
- `handleAddPerson()`  
  Creates a personnel record.
- `handleAddAssignment()`  
  Links person + requirement with due-date logic.
- `updateRequirement(...)`, `updatePerson(...)`, `updateAssignment(...)`  
  Save edits to each roster object type.
- `handleRecordCompletionToday(assignmentId)`  
  Marks assignment completion using current date.
- `handleDeleteAssignment(assignment)` / `handleDeleteRequirement(req)` / `handleConfirmDeletePerson()`  
  Removes roster entities with confirmation.
- `handleMigrateRosterRules()`  
  Runs migration utility for roster rules compatibility.

## Common failure states

- Missing active project: all create/update actions disabled.
- Invalid assignment relationships: ensure person and requirement exist first.
- Delete blocked by dependency: remove linked assignments before deleting parent entities.
