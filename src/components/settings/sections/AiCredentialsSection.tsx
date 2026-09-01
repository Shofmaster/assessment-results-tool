import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { FiCheckCircle, FiKey, FiXCircle } from 'react-icons/fi';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { useUserSettings } from '../../../hooks/useConvexData';
import { useConfirmDialog } from '../../confirm/ConfirmDialogProvider';
import { Badge, Button, Field, PasswordInput, SettingsCard } from '../../ui';

/**
 * Where a company admin supplies their own AI provider key.
 *
 * Anthropic keys cannot be minted programmatically and belong to an
 * organization rather than a user, so "a key per user" is not a thing that
 * exists. What works instead: one key per customer company, inherited by every
 * member, billed to that customer's own account.
 *
 * DELIBERATELY UNLIKE the Avianis card in IntegrationsSection: there is no
 * hydrate-from-server step. Avianis secrets round-trip to the browser in
 * plaintext so its inputs can be pre-filled; nothing here ever leaves the
 * server. The inputs start empty every time, an empty field on save means
 * "leave unchanged", and clearing a key is an explicit Remove.
 */

type Provider = 'anthropic' | 'openai' | 'voyage';

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  voyage: 'Voyage',
};

const PROVIDER_HELP: Record<Provider, string> = {
  anthropic: 'Powers analysis, audit simulation, Ask an Expert and paperwork review.',
  openai: 'Used to embed documents for library search.',
  voyage: 'Used to embed documents for library search.',
};

const PROVIDER_CONSOLE: Record<Provider, string> = {
  anthropic: 'https://platform.claude.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  voyage: 'https://dashboard.voyageai.com/api-keys',
};

interface ProviderStatus {
  state: 'company' | 'install' | 'none';
  last4?: string;
  updatedAt?: number;
  updatedByEmail?: string;
  lastVerifiedAt?: number;
  lastVerifyOk?: boolean;
  lastVerifyMessage?: string;
  deploymentFallbackConfigured: boolean;
}

function formatDate(ms: number | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function stateBadge(state: ProviderStatus['state'], scope: 'company' | 'install') {
  if (scope === 'install') {
    return state === 'none' ? (
      <Badge variant="default">Not set</Badge>
    ) : (
      <Badge variant="success">Set</Badge>
    );
  }
  if (state === 'company') return <Badge variant="success">Using your key</Badge>;
  if (state === 'install') return <Badge variant="default">Inherited</Badge>;
  return <Badge variant="warning">Not configured</Badge>;
}

interface ProviderRowProps {
  provider: Provider;
  status: ProviderStatus;
  scope: 'company' | 'install';
  canEdit: boolean;
  onSave: (provider: Provider, apiKey: string) => Promise<void>;
  onRemove: (provider: Provider) => Promise<void>;
  onTest: (provider: Provider) => Promise<{ ok: boolean; message: string }>;
}

function ProviderRow({
  provider,
  status,
  scope,
  canEdit,
  onSave,
  onRemove,
  onTest,
}: ProviderRowProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // The key is never sent to the browser, so the most we can show is the last
  // four characters the server recorded when it was saved.
  const masked = status.last4 ? `••••${status.last4}` : '';
  // Only a row stored AT THIS SCOPE can be replaced or removed here; an
  // inherited one belongs to the install default.
  const storedHere = scope === 'install' ? status.state !== 'none' : status.state === 'company';

  const run = async (kind: 'save' | 'test' | 'remove', fn: () => Promise<void>) => {
    setBusy(kind);
    setResult(null);
    try {
      await fn();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = () =>
    void run('save', async () => {
      const trimmed = value.trim();
      if (!trimmed) {
        setResult({ ok: false, message: 'Paste a key first.' });
        return;
      }
      await onSave(provider, trimmed);
      // Clear immediately: keeping it on screen serves no purpose and the field
      // is not a display of stored state.
      setValue('');
      // Saving then verifying in one action is what makes a typo obvious now
      // rather than on the next analysis run.
      setResult(await onTest(provider));
    });

  const handleTest = () => void run('test', async () => setResult(await onTest(provider)));

  const handleRemove = () =>
    void run('remove', async () => {
      await onRemove(provider);
      setValue('');
    });

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{PROVIDER_LABEL[provider]}</span>
          {stateBadge(status.state, scope)}
        </div>
        <a
          href={PROVIDER_CONSOLE[provider]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-light hover:underline"
        >
          Get a key
        </a>
      </div>

      <p className="text-sm text-white/60 mb-3">{PROVIDER_HELP[provider]}</p>

      {storedHere && (
        <p className="text-xs text-white/50 mb-3">
          {masked}
          {status.updatedAt ? ` · updated ${formatDate(status.updatedAt)}` : ''}
          {status.updatedByEmail ? ` by ${status.updatedByEmail}` : ''}
          {status.lastVerifiedAt ? (
            <>
              {' · '}
              {status.lastVerifyOk ? (
                <span className="text-emerald-300">verified {formatDate(status.lastVerifiedAt)}</span>
              ) : (
                <span className="text-rose-300">failed verification</span>
              )}
            </>
          ) : null}
        </p>
      )}

      {scope === 'company' && status.state === 'install' && (
        <p className="text-xs text-white/50 mb-3">
          Currently using this deployment&apos;s built-in key
          {status.last4 ? ` (${masked})` : ''}. Add your company&apos;s own key below to bill your
          own {PROVIDER_LABEL[provider]} account instead.
        </p>
      )}

      {scope === 'company' && status.state === 'none' && !status.deploymentFallbackConfigured && (
        <p className="text-xs text-amber-300/90 mb-3">
          No key is configured anywhere, so features using {PROVIDER_LABEL[provider]} will not work
          until one is added.
        </p>
      )}

      {canEdit ? (
        <>
          <Field
            label={storedHere ? 'Replace key' : 'API key'}
            help="Pasted keys are stored on the server and never sent back to a browser."
          >
            {({ id, describedBy }) => (
              <PasswordInput
                id={id}
                aria-describedby={describedBy}
                secretName={`${PROVIDER_LABEL[provider]} API key`}
                autoComplete="off"
                placeholder={storedHere ? masked : 'Paste the key'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button onClick={handleSave} disabled={busy !== null || !value.trim()}>
              {busy === 'save' ? 'Saving…' : 'Save and test'}
            </Button>
            {storedHere && (
              <>
                <Button variant="secondary" onClick={handleTest} disabled={busy !== null}>
                  {busy === 'test' ? 'Testing…' : 'Test'}
                </Button>
                <Button variant="ghost" onClick={handleRemove} disabled={busy !== null}>
                  {busy === 'remove' ? 'Removing…' : 'Remove'}
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-white/50">
          Only a company admin can change this key.
        </p>
      )}

      {result && (
        <p
          className={`mt-3 flex items-start gap-2 text-sm ${
            result.ok ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          {result.ok ? (
            <FiCheckCircle className="mt-0.5 shrink-0" />
          ) : (
            <FiXCircle className="mt-0.5 shrink-0" />
          )}
          <span>{result.message}</span>
        </p>
      )}
    </div>
  );
}

export function AiCredentialsSection() {
  const settings = useUserSettings();
  const confirmDialog = useConfirmDialog();
  const companyId = settings?.activeCompanyId as Id<'companies'> | undefined;

  const status = useQuery(api.aiCredentials.status, { companyId });

  const setCompanyCredential = useAction(api.aiCredentials.setCompanyCredential);
  const setInstallCredential = useAction(api.aiCredentials.setInstallCredential);
  const removeCompanyCredential = useMutation(api.aiCredentials.removeCompanyCredential);
  const removeInstallCredential = useMutation(api.aiCredentials.removeInstallCredential);
  const testCredential = useAction(api.aiCredentials.testCredential);

  if (status === undefined) {
    return <p className="text-sm text-white/60">Loading…</p>;
  }

  // Anthropic is always relevant. Exactly ONE embedding provider is shown, the
  // one this deployment is configured for: EMBEDDING_DIMENSIONS is baked into
  // the vector index, so the provider is deployment-wide and only the key is
  // per-company. Offering both would invite a mismatched index.
  const providers: Provider[] = ['anthropic', status.embeddingProvider as Provider];

  const scopedCompanyId = status.scope.kind === 'company' ? status.scope.companyId : undefined;

  // The consequence of removing differs by scope, and saying the wrong one is
  // actively misleading: removing the DEPLOYMENT DEFAULT cannot "fall back to
  // this deployment's built-in key" - it IS that key. What is left underneath it
  // is only whatever the server has in its environment.
  const confirmRemoval = (provider: Provider, scope: 'company' | 'install') =>
    confirmDialog({
      title: `Remove the ${PROVIDER_LABEL[provider]} key?`,
      message:
        scope === 'company'
          ? `Your company will fall back to this deployment's default key, or stop working if there isn't one.`
          : `Everyone without their own company key will fall back to the key configured in this server's environment, or stop working if there isn't one.`,
      confirmLabel: 'Remove key',
    });

  return (
    <>
      {scopedCompanyId ? (
        <SettingsCard
          title={status.scope.companyName ? `${status.scope.companyName} keys` : 'Company keys'}
          description="Your company's own AI provider keys. Every member inherits them, and usage is billed to your account."
          icon={<FiKey />}
          iconGradient="from-sky to-sky-light"
        >
          <div className="space-y-4">
            {providers.map((provider) => (
              <ProviderRow
                key={provider}
                provider={provider}
                scope="company"
                canEdit={status.canEdit}
                status={status.providers[provider] as ProviderStatus}
                onSave={async (p, apiKey) => {
                  await setCompanyCredential({ companyId: scopedCompanyId, provider: p, apiKey });
                }}
                onRemove={async (p) => {
                  if (!(await confirmRemoval(p, 'company'))) return;
                  await removeCompanyCredential({ companyId: scopedCompanyId, provider: p });
                }}
                onTest={async (p) =>
                  testCredential({ companyId: scopedCompanyId, provider: p })
                }
              />
            ))}
          </div>
        </SettingsCard>
      ) : (
        <SettingsCard
          title="Company keys"
          description="Select a workspace to manage its AI provider keys."
          icon={<FiKey />}
          iconGradient="from-sky to-sky-light"
        >
          <p className="text-sm text-white/60">
            You are not working in a company workspace right now, so AI requests use this
            deployment&apos;s built-in key.
          </p>
        </SettingsCard>
      )}

      {status.canEditInstall && (
        <SettingsCard
          title="Deployment default"
          description="Used by anyone without a company key of their own. On a single-organisation install this is usually the only key you need."
          icon={<FiKey />}
          iconGradient="from-navy-600 to-sky"
        >
          <div className="space-y-4">
            {providers.map((provider) => (
              <ProviderRow
                key={provider}
                provider={provider}
                scope="install"
                canEdit
                status={status.providers[provider] as ProviderStatus}
                onSave={async (p, apiKey) => {
                  await setInstallCredential({ provider: p, apiKey });
                }}
                onRemove={async (p) => {
                  if (!(await confirmRemoval(p, 'install'))) return;
                  await removeInstallCredential({ provider: p });
                }}
                onTest={async (p) => testCredential({ provider: p })}
              />
            ))}
          </div>
        </SettingsCard>
      )}

      <p className="text-xs text-white/40 mt-4">
        Key changes take effect within about a minute. Keys are stored on the AeroGap server and
        used only to make requests on your behalf; they are never sent to a browser.
      </p>
    </>
  );
}
