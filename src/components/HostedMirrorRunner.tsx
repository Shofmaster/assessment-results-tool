import { useCallback, useEffect, useRef } from 'react';
import { useConvex, useConvexAuth } from 'convex/react';
import { toast } from 'sonner';
import { useAuth, useUser, isLocalAuth, isSelfHosted, isHostedIdentity } from '../auth';
import { getConfigValue } from '../config/runtimeEnv';
import {
  createHostedClient,
  mirrorChangedSomething,
  runHostedMirror,
  type HostedConvexLike,
} from '../services/hostedMirror';
import { hostedMirrorStore, registerMirrorRunner } from '../services/hostedMirrorStore';

/** Between automatic runs while the page stays open. */
const INTERVAL_MS = 15 * 60 * 1000;
/** Let the app settle after sign-in before the first run. */
const INITIAL_DELAY_MS = 2_500;

/**
 * Keeps a desktop install's copy of the hosted account current.
 *
 * Mounted inside AuthGate on every deployment; does nothing unless this is a
 * self-hosted install, signed in with a HOSTED account, running the Clerk
 * provider (that is where the token both deployments trust comes from), with a
 * hosted Convex URL to pull from. On the hosted product itself, or on a local
 * account, or offline on the local session, it renders nothing and runs nothing.
 *
 * Runs shortly after sign-in, then every 15 minutes, and when the browser
 * comes back online. Settings → Workspace has a "Sync now" that goes through
 * registerMirrorRunner.
 */
export default function HostedMirrorRunner() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const local = useConvex();

  const hostedUrl = getConfigValue('hostedConvexUrl') ?? null;
  const available = Boolean(
    isSelfHosted && !isLocalAuth && hostedUrl && isAuthenticated && user && isHostedIdentity(user.id),
  );

  const hostedRef = useRef<HostedConvexLike | null>(null);
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (!available || !hostedUrl || runningRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    runningRef.current = true;
    hostedMirrorStore.start();
    try {
      if (!hostedRef.current) hostedRef.current = createHostedClient(hostedUrl);
      const summary = await runHostedMirror({
        local,
        hosted: hostedRef.current,
        origin: hostedUrl,
        getToken: () => getToken({ template: 'convex' }),
        onProgress: (p) => hostedMirrorStore.progress(p),
      });
      hostedMirrorStore.finish(summary);
      if (mirrorChangedSomething(summary)) {
        const c = summary.companies.created + summary.companies.updated;
        const p = summary.projects.created + summary.projects.updated;
        toast.message('Your AeroGap account was copied to this computer', {
          description: `${c} compan${c === 1 ? 'y' : 'ies'} and ${p} project${p === 1 ? '' : 's'} updated. They stay available offline.`,
          duration: 6_000,
        });
      }
      if (summary.errors.length > 0 && summary.errors[0].scope === 'list') {
        hostedMirrorStore.fail(summary.errors[0].message);
      }
    } catch (err) {
      hostedMirrorStore.fail(err instanceof Error ? err.message : String(err));
    } finally {
      runningRef.current = false;
    }
  }, [available, hostedUrl, local, getToken]);

  useEffect(() => {
    hostedMirrorStore.setAvailable(available);
  }, [available]);

  useEffect(() => {
    if (!available) {
      registerMirrorRunner(null);
      return;
    }
    registerMirrorRunner(() => void run());
    const initial = setTimeout(() => void run(), INITIAL_DELAY_MS);
    const interval = setInterval(() => void run(), INTERVAL_MS);
    const onOnline = () => void run();
    window.addEventListener('online', onOnline);
    return () => {
      registerMirrorRunner(null);
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [available, run]);

  return null;
}
