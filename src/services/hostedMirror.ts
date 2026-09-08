/**
 * Hosted → desktop mirror, client side.
 *
 * Runs on a desktop install while the page is signed in with the hosted account
 * (Clerk). The same token is trusted by both Convex deployments, so a second
 * client is opened at the hosted one and the account's companies and projects
 * are pulled as bundles and applied to the local deployment
 * (convex/mirror.ts). One way: hosted is the source of truth.
 *
 * Cheap to repeat. Each bundle is hashed and the local apply is a no-op when
 * the hash matches what was applied last time, so an every-launch sync of an
 * unchanged account costs one read per company and project.
 *
 * Kept free of React so it can be tested with fakes; the runner component
 * (components/HostedMirrorRunner.tsx) supplies the clients and the schedule.
 */
import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReference } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

/** The two calls the local side needs, satisfied by ConvexReactClient and ConvexHttpClient. */
export interface LocalConvexLike {
  query<Q extends FunctionReference<'query'>>(ref: Q, args: Q['_args']): Promise<Q['_returnType']>;
  mutation<M extends FunctionReference<'mutation'>>(ref: M, args: M['_args']): Promise<M['_returnType']>;
}

/** The hosted side; a ConvexHttpClient, or a fake in tests. */
export interface HostedConvexLike {
  setAuth(token: string): void;
  query<Q extends FunctionReference<'query'>>(ref: Q, args: Q['_args']): Promise<Q['_returnType']>;
}

/*
 * Shapes of the convex/mirror.ts functions. The generated api types their
 * return values as `any`, so they are spelled out here and kept in step by the
 * service test's fakes.
 */
export type MirrorRole = 'company_admin' | 'company_manager' | 'company_user';

export interface MirrorableListing {
  companies: Array<{
    id: Id<'companies'>;
    name: string;
    role: MirrorRole;
    projects: Array<{ id: Id<'projects'>; name: string }>;
  }>;
  personalProjects: Array<{ id: Id<'projects'>; name: string }>;
}

export interface MirrorStatus {
  companies: Array<{ originId: string; contentHash?: string }>;
  projects: Array<{ originId: string; contentHash?: string }>;
}

export interface MirrorApplyResult {
  skipped: boolean;
  created?: boolean;
}

export interface MirrorProgress {
  phase: 'listing' | 'companies' | 'projects' | 'done';
  /** What is being worked on right now, for the status line. */
  label?: string;
  done: number;
  total: number;
}

export interface MirrorCounts {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

export interface MirrorSummary {
  origin: string;
  startedAt: string;
  finishedAt: string;
  companies: MirrorCounts;
  projects: MirrorCounts;
  errors: Array<{ scope: 'list' | 'company' | 'project'; name: string; message: string }>;
}

function emptyCounts(): MirrorCounts {
  return { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0 };
}

/**
 * Deterministic JSON: keys sorted at every level, so the same content always
 * hashes the same whatever order a deployment happened to return it in.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

/** SHA-256 of a bundle's CONTENT - `exportedAt` changes on every export and is left out. */
export async function hashBundle(bundle: Record<string, unknown>): Promise<string> {
  const { exportedAt: _ignored, ...content } = bundle;
  const bytes = new TextEncoder().encode(stableStringify(content));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface RunHostedMirrorOptions {
  local: LocalConvexLike;
  hosted: HostedConvexLike;
  /** The hosted deployment URL; recorded on every mirrored row as its origin. */
  origin: string;
  /**
   * Clerk's getToken for the "convex" template. Called before EVERY hosted
   * request: those tokens live about a minute and a large account takes longer.
   */
  getToken: () => Promise<string | null>;
  onProgress?: (progress: MirrorProgress) => void;
}

export async function runHostedMirror(options: RunHostedMirrorOptions): Promise<MirrorSummary> {
  const { local, hosted, origin, getToken, onProgress } = options;
  const startedAt = new Date().toISOString();
  const summary: MirrorSummary = {
    origin,
    startedAt,
    finishedAt: startedAt,
    companies: emptyCounts(),
    projects: emptyCounts(),
    errors: [],
  };

  const authed = async <T>(call: () => Promise<T>): Promise<T> => {
    const token = await getToken();
    if (!token) throw new Error('No hosted session token - are you signed in with your AeroGap account?');
    hosted.setAuth(token);
    return await call();
  };

  onProgress?.({ phase: 'listing', done: 0, total: 0 });
  let listing: MirrorableListing;
  try {
    listing = (await authed(() => hosted.query(api.mirror.listMirrorable, {}))) as MirrorableListing;
  } catch (err) {
    summary.errors.push({ scope: 'list', name: origin, message: messageOf(err) });
    summary.finishedAt = new Date().toISOString();
    onProgress?.({ phase: 'done', done: 0, total: 0 });
    return summary;
  }

  // What is already here, so an unchanged bundle is not even sent.
  const known = (await local.query(api.mirror.status, {})) as MirrorStatus;
  const knownCompanyHash = new Map(known.companies.map((c) => [c.originId, c.contentHash]));
  const knownProjectHash = new Map(known.projects.map((p) => [p.originId, p.contentHash]));

  const projectsToMirror: Array<{ id: Id<'projects'>; name: string; companyOriginId?: string }> = [];
  for (const company of listing.companies) {
    for (const project of company.projects) {
      projectsToMirror.push({ id: project.id, name: project.name, companyOriginId: company.id });
    }
  }
  for (const project of listing.personalProjects) {
    projectsToMirror.push({ id: project.id, name: project.name });
  }

  const tally = (counts: MirrorCounts, result: MirrorApplyResult | 'unchanged') => {
    if (result === 'unchanged' || result.skipped) counts.unchanged += 1;
    else if (result.created) counts.created += 1;
    else counts.updated += 1;
  };

  summary.companies.total = listing.companies.length;
  let done = 0;
  for (const company of listing.companies) {
    onProgress?.({ phase: 'companies', label: company.name, done, total: listing.companies.length });
    try {
      const bundle = (await authed(() =>
        hosted.query(api.mirror.exportCompany, { companyId: company.id }),
      )) as Record<string, unknown>;
      const contentHash = await hashBundle(bundle);
      if (knownCompanyHash.get(company.id) === contentHash) {
        tally(summary.companies, 'unchanged');
      } else {
        const result = (await local.mutation(api.mirror.applyCompany, {
          origin,
          originId: company.id,
          role: company.role,
          bundle,
          contentHash,
        })) as MirrorApplyResult;
        tally(summary.companies, result);
      }
    } catch (err) {
      summary.companies.failed += 1;
      summary.errors.push({ scope: 'company', name: company.name, message: messageOf(err) });
    }
    done += 1;
  }

  summary.projects.total = projectsToMirror.length;
  done = 0;
  for (const project of projectsToMirror) {
    onProgress?.({ phase: 'projects', label: project.name, done, total: projectsToMirror.length });
    try {
      const bundle = (await authed(() =>
        hosted.query(api.mirror.exportProject, { projectId: project.id }),
      )) as Record<string, unknown>;
      const contentHash = await hashBundle(bundle);
      if (knownProjectHash.get(project.id) === contentHash) {
        tally(summary.projects, 'unchanged');
      } else {
        const result = (await local.mutation(api.mirror.applyProject, {
          origin,
          originId: project.id,
          companyOriginId: project.companyOriginId,
          bundle,
          contentHash,
        })) as MirrorApplyResult;
        tally(summary.projects, result);
      }
    } catch (err) {
      summary.projects.failed += 1;
      summary.errors.push({ scope: 'project', name: project.name, message: messageOf(err) });
    }
    done += 1;
  }

  summary.finishedAt = new Date().toISOString();
  onProgress?.({ phase: 'done', done, total: projectsToMirror.length });
  return summary;
}

/** A hosted client for the given deployment. Separate so tests can substitute a fake. */
export function createHostedClient(hostedUrl: string): HostedConvexLike {
  return new ConvexHttpClient(hostedUrl);
}

/** Did the run change anything worth telling the user about? */
export function mirrorChangedSomething(summary: MirrorSummary): boolean {
  const c = summary.companies;
  const p = summary.projects;
  return c.created + c.updated + p.created + p.updated > 0;
}
