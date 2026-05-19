# Certificate Profile Migration Plan (Phase A)

## Purpose
Phase A introduces certificate-profile normalization without breaking existing workflows. This document defines rollout and verification for the schema and migration scaffolding.

## New Data Structures
- `certificateProfiles`
  - Canonical profile rows keyed by authority + certificate type + scope code.
  - Optional linkage to legacy `entityProfiles` for compatibility.
- `obligationSetDefinitions`
  - Versioned recurring-obligation definitions by profile.

## New Services
- `convex/lib/profileEngine.ts`
  - Feature-flag resolution per project/user.
  - Active profile resolution with project -> company fallback.
  - Obligation set version resolution by profile.
- `convex/certificateProfiles.ts`
  - Project-scoped profile listing/resolution.
  - Admin upsert for obligation-set definitions.

## Compatibility Strategy
- Existing `entityProfiles` stay source-compatible in Phase A.
- New linkage fields are optional on existing tables:
  - `auditChecklistRuns.certificateProfileId`
  - `auditChecklistItems.obligationRuleId`
  - `inspectionScheduleItems.certificateProfileId`
  - `entityIssues.certificateProfileId`
- Legacy reads continue to function when new fields are missing.

## Backfill Mutation
- Mutation: `migrations.backfillCertificateProfilesFromEntityProfiles`
- Behavior:
  - Creates one `certificateProfiles` row per `entityProfiles` row when missing.
  - Derives authority/type from existing FAA/EASA/IS-BAO/AS9100 fields.
  - Backfills `auditChecklistRuns.certificateProfileId` from legacy `profileId` linkage.

## Rollout Flags
- `profile-engine-v2`
- `profile-aware-checklists`
- `profile-aware-scheduler`
- `profile-aware-reporting`

Recommended enable sequence:
1. `profile-engine-v2`
2. `profile-aware-checklists`
3. `profile-aware-scheduler`
4. `profile-aware-reporting`

## Runbook
1. Deploy schema changes.
2. Deploy migration mutation.
3. Run migration in admin context.
4. Verify row counts and sample tenant mappings.
5. Enable `profile-engine-v2` for internal tenant(s) only.
6. Seed obligation definitions using:
   - `certificateProfiles.seedDefaultObligationSets` (recommended baseline packs), and/or
   - `certificateProfiles.upsertObligationSetDefinition` for tenant-specific profile codes.
7. Progressively enable dependent feature flags after verification.

## Verification Checklist
- Existing checklist/schedule/report flows unchanged when all new flags are off.
- `certificateProfiles` populated for targeted projects/companies.
- No migration failures for legacy rows missing optional profile fields.
- Checklist runs can resolve a `certificateProfileId` where `profileId` exists.
- No regressions in tenant feature policy behavior.
