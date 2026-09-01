import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiClock, FiShield } from 'react-icons/fi';
import { Badge, Button, Field, Input, SettingsCard } from '../../ui';
import type { BadgeVariant } from '../../ui';
import { validateLicenseKey, formatLicenseKey, normalizeLicenseKey } from '../../../services/licenseKey';

/**
 * Where a customer activates their license.
 *
 * WHAT THIS PANEL IS CAREFUL ABOUT
 * Activation records the install for licensing and support visibility. It does
 * not gate access to your records or disable the app when unlicensed — AI keys
 * are configured separately under Settings > AI Keys.
 *
 * The key is validated in the browser first. A mistyped key would otherwise
 * cost a round trip and come back as a generic failure, which a customer reads
 * as "you sold me a bad key" and turns into a support ticket nobody can resolve
 * without reading 16 characters back down a phone line.
 *
 * This panel never decides entitlement. It displays what the server said. A
 * paywall enforced in the browser is not a paywall.
 */

type EntitlementState = 'licensed' | 'unlicensed' | 'grace' | 'expired';

interface Entitlements {
  enabledFeatures: string[];
  tier: string;
  state: EntitlementState;
  lastCheckInAt: number | null;
  reason: string;
}

const STATE_BADGE: Record<
  EntitlementState,
  { variant: BadgeVariant; label: string; icon: ReactNode }
> = {
  licensed: { variant: 'success', label: 'Active', icon: <FiCheckCircle /> },
  grace: { variant: 'warning', label: 'Active (offline)', icon: <FiClock /> },
  expired: { variant: 'warning', label: 'Needs attention', icon: <FiAlertTriangle /> },
  unlicensed: { variant: 'default', label: 'Not activated', icon: <FiShield /> },
};

function formatDate(ms: number | null): string {
  if (!ms) return 'never';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ActivationSection() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Read the current entitlements. Returns null rather than throwing: the
   * endpoint only exists on a self-hosted or desktop install, and on the hosted
   * product its absence is normal, not an error to put in front of anyone.
   */
  const loadEntitlements = useCallback(async (): Promise<Entitlements | null> => {
    try {
      const response = await fetch('/api/entitlements');
      if (!response.ok) return null;
      return (await response.json()) as Entitlements;
    } catch {
      return null;
    }
  }, []);

  /** The Refresh button. Safe to call outside an effect. */
  const refresh = useCallback(async () => {
    setLoading(true);
    setEntitlements(await loadEntitlements());
    setLoading(false);
  }, [loadEntitlements]);

  useEffect(() => {
    // Fetch-on-mount against a local HTTP endpoint, which is not something
    // Convex's reactive queries cover. The state updates happen after an await,
    // not synchronously in the effect body, and `cancelled` stops a late
    // response writing to an unmounted component.
    let cancelled = false;
    void (async () => {
      const result = await loadEntitlements();
      if (cancelled) return;
      setEntitlements(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEntitlements]);

  const activate = useCallback(async () => {
    setError(null);
    setSuccess(null);

    // Local check first: catches a typo instantly and explains it, instead of
    // spending a round trip to say "invalid".
    const validation = validateLicenseKey(input);
    if (!validation.ok) {
      setError(validation.message || 'That license key is not valid.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: validation.normalized }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error || 'The license could not be activated. Please try again.');
        return;
      }

      const next = body as Entitlements;
      setEntitlements(next);
      setInput('');

      if (next.state === 'licensed') {
        setSuccess('License activated.');
      } else {
        // Saved, but the licensing server did not confirm it. Saying "activated"
        // here would be a lie the customer discovers later.
        setError(
          'The key was saved, but the licensing server could not confirm it yet. ' +
            'AeroGap will keep trying in the background.',
        );
      }
    } catch {
      setError('Could not reach this machine’s AeroGap service. Is it still running?');
    } finally {
      setSaving(false);
    }
  }, [input]);

  if (loading) {
    return (
      <SettingsCard title="Activation" description="Checking this installation’s license…">
        <div className="h-16" />
      </SettingsCard>
    );
  }

  // Hosted product: no local licensing service, nothing to activate.
  if (!entitlements) return null;

  const badge = STATE_BADGE[entitlements.state];
  const preview = input.trim() ? formatLicenseKey(normalizeLicenseKey(input)) : '';

  return (
    <SettingsCard
      title="Activation"
      description="Register this installation with Aviation Quality Company. This records your license for support and updates; it does not disable access to your records."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={badge.variant}>
            <span className="inline-flex items-center gap-1.5">
              {badge.icon}
              {badge.label}
            </span>
          </Badge>
          {entitlements.tier !== 'unlicensed' && (
            <span className="text-sm text-white/70 capitalize">{entitlements.tier} plan</span>
          )}
          <span className="text-xs text-white/40">Last confirmed: {formatDate(entitlements.lastCheckInAt)}</span>
        </div>

        <p className="text-sm text-white/70">{entitlements.reason}</p>

        {entitlements.state === 'expired' && (
          // The single most important sentence on this screen. A shop that
          // believes its records are held hostage will never trust us again.
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Your records remain fully readable and exportable. Only AI features are paused.
          </div>
        )}

        <Field
          label="License key"
          help="From your invoice or welcome email. Dashes and capitalisation do not matter."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="text"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setError(null);
                setSuccess(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !saving) void activate();
              }}
              placeholder="AGXX-XXXX-XXXX-XXXX"
              spellCheck={false}
              autoComplete="off"
              className="font-mono tracking-wider"
            />
          )}
        </Field>

        {/* Shows the canonical grouping as they type, so a key that looks wrong
            is visibly wrong before they press the button. */}
        {preview && preview !== input.trim() && (
          <p className="-mt-3 font-mono text-xs text-white/40">Reads as: {preview}</p>
        )}

        {error && <p className="text-sm text-rose-300">{error}</p>}
        {success && <p className="text-sm text-emerald-300">{success}</p>}

        <div className="flex items-center gap-3">
          <Button onClick={() => void activate()} disabled={saving || !input.trim()}>
            {saving ? 'Activating…' : 'Activate'}
          </Button>
          <Button variant="ghost" onClick={() => void refresh()} disabled={saving}>
            Refresh status
          </Button>
        </div>

        <div className="border-t border-white/10 pt-4 text-sm text-white/60">
          <p className="font-medium text-white/80">No license?</p>
          <p className="mt-1">
            AeroGap works without one. You can also supply your own AI provider key under{' '}
            <span className="text-white/80">Settings &rsaquo; AI Keys</span>, which bills your own
            provider account instead of a subscription.
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}
