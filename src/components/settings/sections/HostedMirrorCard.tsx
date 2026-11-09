import type { ReactNode } from 'react';
import { FiCloud, FiRefreshCw } from 'react-icons/fi';
import { SettingsCard } from '../../ui';
import { useUser, isLocalAuth, isSelfHosted, isTransientLocalFallback, isHostedIdentity } from '../../../auth';
import { getConfigValue } from '../../../config/runtimeEnv';
import { requestMirrorRun, useHostedMirror } from '../../../services/hostedMirrorStore';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Settings → Workspace: the state of the hosted → desktop mirror.
 *
 * Shown only on a self-hosted install; says one of four things, in order of
 * how much the user can do about it: not configured, local account (nothing to
 * mirror), offline (will resume), or the last result with a "Sync now".
 */
export function HostedMirrorCard() {
  const { user } = useUser();
  const mirror = useHostedMirror();
  const hostedUrl = getConfigValue('hostedConvexUrl');

  if (!isSelfHosted) return null;

  const hostedAccount = isHostedIdentity(user?.id);
  const summary = mirror.lastSummary;

  let body: ReactNode;
  if (!hostedUrl) {
    body = (
      <p className="text-sm text-white/60">
        This installation was built without a hosted deployment to copy from, so your AeroGap
        account's companies are not mirrored here. Use project and organization bundles to move work.
      </p>
    );
  } else if (!hostedAccount) {
    body = (
      <p className="text-sm text-white/60">
        You are signed in with a local account. Sign in with your AeroGap account to have its
        companies and projects copied to this computer and kept up to date while online.
      </p>
    );
  } else if (isLocalAuth || isTransientLocalFallback) {
    body = (
      <p className="text-sm text-white/60">
        You are working offline with the copy on this computer
        {summary ? ` (last updated ${formatWhen(summary.finishedAt)})` : ''}. Restart AeroGap when you are
        back online to pick up changes from your account.
      </p>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-white/60">
          While online, the companies and projects of your AeroGap account are copied to this
          computer so they are available when the connection is lost. Your account is the source
          of truth: changes made there replace the copy here on the next sync.
        </p>
        {mirror.running && mirror.progress ? (
          <p className="text-sm text-sky-lighter" role="status">
            {mirror.progress.phase === 'listing'
              ? 'Checking your account…'
              : mirror.progress.phase === 'companies'
                ? `Copying company ${mirror.progress.done + 1} of ${mirror.progress.total}: ${mirror.progress.label ?? ''}`
                : mirror.progress.phase === 'members'
                  ? `Syncing people of ${mirror.progress.label ?? 'a company'}`
                  : mirror.progress.phase === 'projects'
                    ? `Copying project ${mirror.progress.done + 1} of ${mirror.progress.total}: ${mirror.progress.label ?? ''}`
                    : mirror.progress.phase === 'invites'
                      ? `Inviting people of ${mirror.progress.label ?? 'a company'} to your account's company`
                      : 'Finishing…'}
          </p>
        ) : summary ? (
          <div className="text-sm text-white/70">
            <p>
              Last synced {formatWhen(summary.finishedAt)}: {summary.companies.total} compan
              {summary.companies.total === 1 ? 'y' : 'ies'}, {summary.projects.total} project
              {summary.projects.total === 1 ? '' : 's'}
              {summary.companies.created + summary.companies.updated + summary.projects.created + summary.projects.updated > 0
                ? ` (${summary.companies.created + summary.companies.updated + summary.projects.created + summary.projects.updated} updated)`
                : ' (no changes)'}
              .
            </p>
            {summary.people ? (
              <p className="mt-1">
                People: {summary.people.remembered} from your account remembered here
                {summary.people.linked > 0 ? `, ${summary.people.linked} linked to a local account by email` : ''}
                {summary.people.invited + summary.people.added > 0
                  ? `, ${summary.people.invited + summary.people.added} from this computer added or invited online`
                  : ''}
                {summary.people.awaiting > 0 ? `, ${summary.people.awaiting} invitation${summary.people.awaiting === 1 ? '' : 's'} waiting to be accepted` : ''}
                .
              </p>
            ) : null}
            {summary.errors.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-amber-200/90">
                {summary.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    {e.scope === 'list'
                      ? 'Could not list your account'
                      : e.scope === 'members'
                        ? `People of “${e.name}”`
                        : e.scope === 'invite'
                          ? `Inviting people of “${e.name}”`
                          : `${e.scope === 'company' ? 'Company' : 'Project'} “${e.name}”`}
                    : {e.message}
                  </li>
                ))}
                {summary.errors.length > 5 ? <li>…and {summary.errors.length - 5} more.</li> : null}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-white/60">Not synced yet on this computer.</p>
        )}
        {mirror.lastError && !mirror.running ? (
          <p className="text-xs text-rose-300" role="alert">
            {mirror.lastError}
          </p>
        ) : null}
        <button
          type="button"
          disabled={mirror.running || !mirror.available}
          onClick={() => {
            requestMirrorRun();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-sky-light/40 bg-sky/20 text-sky-lighter text-sm font-medium hover:bg-sky/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiRefreshCw className={mirror.running ? 'animate-spin' : ''} aria-hidden="true" />
          {mirror.running ? 'Syncing…' : 'Sync now'}
        </button>
        <p className="text-xs text-white/40">
          Included: company profile, certificates, ratings, roster, and each project's assessments,
          documents, analyses, simulations and findings. Not included: manuals, logbooks, fleet,
          checklists, uploaded files, and search indexes (rebuild those here).
        </p>
        <p className="text-xs text-white/40">
          People: your companies' members are remembered here, and a local account with the same
          email is treated as the same person. Where you are a company admin online, people you add
          to that company on this computer are invited to it online by email; they join when they
          sign in there with that address. Passwords never leave this computer.
        </p>
      </div>
    );
  }

  return (
    <SettingsCard
      title="Your AeroGap account on this computer"
      description="Companies and projects from your hosted account, copied here for offline use."
      icon={<FiCloud />}
      iconGradient="from-sky-500 to-cyan-500"
    >
      {body}
    </SettingsCard>
  );
}
