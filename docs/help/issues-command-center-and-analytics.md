# Issues, Command Center, and Analytics

Routes:
- `/entity-issues` (`EntityIssues`)
- `/quality-command-center` (`ComplianceDashboard`)
- `/analytics` (`AnalyticsDashboard`)

Primary backend:
- `convex/entityIssues.ts`
- `convex/qualityDashboard.ts`
- `convex/analytics.ts`

## What these pages do

- `EntityIssues`: Create, update, prioritize, and close CARs/issues.
- `ComplianceDashboard`: Operational summary of issue and compliance signals.
- `AnalyticsDashboard`: Trend and KPI metrics across project/compliance datasets.

## Key functions and behavior

### Entity issues (`src/components/EntityIssues.tsx`)

- `handleAddManual()`  
  Creates a manual issue/CAR record.
- `handleSave()`  
  Saves edited issue details.
- `handleStatusChange(newStatus)`  
  Transitions issue workflow status.
- `handleAiRootCause()`  
  Generates AI-assisted root-cause suggestion and stores result.
- `handleRemove(issueId)`  
  Deletes selected issue.

### Command center (`src/components/ComplianceDashboard.tsx`)

- `useQuery(api.qualityDashboard.getCommandCenterSummary, ...)`  
  Loads aggregated compliance health metrics.
- Feature gates (`useIsFeatureEnabled`, `useIsQualityCommandHubAvailable`)  
  Controls card visibility and route access by entitlement.

### Analytics (`src/components/AnalyticsDashboard.tsx`)

- `useProjectStats(projectId)`  
  Loads project-level summary metrics.
- `useComplianceTrend(projectId)`  
  Loads trend series for compliance trajectory.
- `useCrossProjectSummary()`  
  Loads cross-project rollup analytics.

## Common failure states

- Feature disabled: dashboard cards/routes hidden by policy.
- Empty data windows: charts/cards show no results until source modules are populated.
- Issue status not updating: check permissions and active project scope.
