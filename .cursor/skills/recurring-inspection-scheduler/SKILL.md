---
name: recurring-inspection-scheduler
description: Use when implementing, extending, or debugging the recurring inspection schedule feature. Provides architecture, key files, extraction patterns, and edge-case handling.
---

# Recurring Inspection Scheduler

## Overview

The schedule feature scans entity documents for recurring inspection/calibration/audit requirements (e.g., "every 6 months", "quarterly"), extracts them via LLM, lets the user review and set last-performed dates, and displays upcoming due dates.

## Architecture

```
Entity Documents (extractedText) → recurringInspectionExtractor (per doc, chunked) → Raw items
→ Review modal (user selects/edits/sets dates) → Convex inspectionScheduleItems
→ InspectionSchedule UI (table, filters, row actions)
```

## Key Files

| File | Purpose |
|------|---------|
| `convex/schema.ts` | `inspectionScheduleItems` table |
| `convex/inspectionSchedule.ts` | Mutations: addItems, updateLastPerformed, updateItem, removeItem; Query: listByProject |
| `src/types/inspectionSchedule.ts` | Types, `computeNextDue`, `getDueStatus` |
| `src/services/recurringInspectionExtractor.ts` | Chunking, LLM extraction, deduplication |
| `src/components/InspectionSchedule.tsx` | Schedule page, scan flow, review modal, table |
| `src/hooks/useConvexData.ts` | `useInspectionScheduleItems`, `useAddInspectionScheduleItems`, etc. |

## Extraction Patterns

The extractor looks for phrases like:
- "every X months" / "every X weeks" / "every X hours" / "every X cycles"
- "quarterly" / "semi-annual" / "annual" / "biennial"
- "performed at least every..." / "shall be inspected every..." / "calibration interval of..."
- "not to exceed X months" / "at intervals not exceeding..."

## Large Document Handling

- If `extractedText` exceeds ~18k chars, split into overlapping chunks (16k with 2k overlap)
- Run extraction per chunk, then deduplicate by title similarity

## Edge Cases

- **No last date in doc**: `lastPerformedAt` null; UI shows "-- Set date" until user enters it
- **Low-confidence items**: Vague phrases like "periodic review" get `confidence: "low"`; flagged in review modal
- **Hours/cycles intervals**: Stored but v1 UI only computes next-due for calendar-based items
- **Duplicate detection**: Review step lets users deselect duplicates before saving

## Trigger Scenarios

Use this skill when:
- Editing schedule-related code (extractor, Convex, component)
- User mentions "schedule", "recurring inspection", "calibration due dates"
- Debugging extraction, review flow, or next-due calculations
