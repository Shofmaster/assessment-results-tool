export const PROJECT_BUNDLE_VERSION = '2.0.0';

export const PROJECT_BUNDLE_SCOPE = {
  includes: [
    'assessments',
    'documents',
    'analyses',
    'simulationResults',
    'documentRevisions',
    'agentDocuments',
    'entityIssues',
  ],
  excludes: [
    'manuals',
    'logbooks',
    'fleet',
    'roster',
    'checklists',
    'company_library',
    'certificate_profiles',
    'billing',
  ],
} as const;

export type ProjectBundle = {
  version: string;
  exportedAt?: string;
  scope?: typeof PROJECT_BUNDLE_SCOPE;
  project: { name: string; description?: string };
  assessments?: unknown[];
  documents?: unknown[];
  analyses?: unknown[];
  simulationResults?: unknown[];
  documentRevisions?: unknown[];
  agentDocuments?: unknown[];
  entityIssues?: unknown[];
};

export function parseProjectBundle(raw: unknown): ProjectBundle {
  if (!raw || typeof raw !== 'object') {
    throw new Error('The file is not a valid AeroGap project bundle.');
  }
  const bundle = raw as Record<string, unknown>;
  if (bundle.version !== PROJECT_BUNDLE_VERSION) {
    throw new Error(
      `Unsupported bundle version "${String(bundle.version)}". Expected ${PROJECT_BUNDLE_VERSION}.`,
    );
  }
  const project = bundle.project as { name?: string; description?: string } | undefined;
  if (!project?.name?.trim()) {
    throw new Error('The bundle is missing a project name.');
  }
  return bundle as ProjectBundle;
}

export function bundleFilename(projectName: string): string {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug || 'project'}-${stamp}.aqp.json`;
}

export function downloadProjectBundle(bundle: ProjectBundle, filename: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readProjectBundleFile(file: File): Promise<ProjectBundle> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  return parseProjectBundle(parsed);
}

declare global {
  interface Window {
    aerogapShell?: {
      onWaiting?: (callback: (attempt: number) => void) => void;
      onStatus?: (callback: (text: string) => void) => void;
      consumePendingBundle?: () => Promise<string | null>;
    };
  }
}

export async function consumeDesktopPendingBundle(): Promise<ProjectBundle | null> {
  const raw = await window.aerogapShell?.consumePendingBundle?.();
  if (!raw) return null;
  return parseProjectBundle(JSON.parse(raw));
}

export const BUNDLE_SCOPE_SUMMARY =
  'Includes assessments, uploaded documents, analyses, audit simulations, revision tracking, agent knowledge docs, and findings. Excludes manuals, logbooks, fleet, roster, and company libraries.';
