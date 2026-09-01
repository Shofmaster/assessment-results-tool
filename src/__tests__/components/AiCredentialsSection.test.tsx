import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Renders the AI Keys settings page against mocked data.
 *
 * This exists because the page cannot be reached without a Clerk session, so
 * the states that matter most — "inherited from the deployment key", "you are
 * not allowed to edit this", and above all "the stored key never reaches the
 * browser" — were otherwise unverified by anything.
 */

const setCompanyCredential = vi.fn().mockResolvedValue({ ok: true, last4: '9999' });
const setInstallCredential = vi.fn().mockResolvedValue({ ok: true, last4: '9999' });
const removeCompanyCredential = vi.fn().mockResolvedValue(undefined);
const removeInstallCredential = vi.fn().mockResolvedValue(undefined);
const testCredential = vi.fn().mockResolvedValue({ ok: true, message: 'Key accepted by Anthropic.' });
const confirmDialog = vi.fn().mockResolvedValue(true);

let statusValue: unknown;
let settingsValue: unknown;

/**
 * Convex function references cannot be stringified (String(ref) throws), so the
 * mocks dispatch on the CALL ARGUMENTS instead of trying to identify the ref:
 * only the set* actions carry an apiKey, and only the company-scoped variants
 * carry a companyId. Returning the inner mock's promise keeps
 * mockRejectedValueOnce working through the dispatcher.
 */
const actionDispatch = vi.fn(async (args: Record<string, unknown>) => {
  if (args && typeof args === 'object' && 'apiKey' in args) {
    return args.companyId ? setCompanyCredential(args) : setInstallCredential(args);
  }
  return testCredential(args);
});

const mutationDispatch = vi.fn(async (args: Record<string, unknown>) =>
  args?.companyId ? removeCompanyCredential(args) : removeInstallCredential(args),
);

vi.mock('convex/react', () => ({
  useQuery: () => statusValue,
  useAction: () => actionDispatch,
  useMutation: () => mutationDispatch,
}));

vi.mock('../../hooks/useConvexData', () => ({
  useUserSettings: () => settingsValue,
}));

vi.mock('../../components/confirm/ConfirmDialogProvider', () => ({
  useConfirmDialog: () => confirmDialog,
}));

const { AiCredentialsSection } = await import(
  '../../components/settings/sections/AiCredentialsSection'
);

/** A full status payload, shaped like what convex/aiCredentials.ts:status returns. */
function status(overrides: Record<string, unknown> = {}) {
  const none = { state: 'none' as const, deploymentFallbackConfigured: false };
  return {
    embeddingProvider: 'voyage' as const,
    scope: { kind: 'none' as const },
    canEdit: false,
    canEditInstall: false,
    providers: { anthropic: none, openai: none, voyage: none },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsValue = undefined;
  statusValue = status();
});

describe('loading', () => {
  it('shows a placeholder until the query resolves', () => {
    statusValue = undefined;
    render(<AiCredentialsSection />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

describe('the stored key never reaches the browser', () => {
  it('renders only the last four characters, never a full key', () => {
    // The single most important property of this page.
    statusValue = status({
      canEditInstall: true,
      providers: {
        anthropic: {
          state: 'install',
          last4: '4242',
          updatedAt: Date.UTC(2026, 7, 28),
          updatedByEmail: 'admin@example.com',
          deploymentFallbackConfigured: false,
        },
        openai: { state: 'none', deploymentFallbackConfigured: false },
        voyage: { state: 'none', deploymentFallbackConfigured: false },
      },
    });
    const { container } = render(<AiCredentialsSection />);

    expect(container.textContent).toContain('4242');
    expect(container.textContent).not.toMatch(/sk-ant-/);
    expect(container.textContent).not.toMatch(/apiKey/);
  });

  it('never pre-fills the input from server state', async () => {
    // Deliberately unlike the Avianis card, whose secrets round-trip to the
    // browser so its inputs CAN be hydrated. Nothing here may be.
    statusValue = status({
      canEditInstall: true,
      providers: {
        anthropic: { state: 'install', last4: '4242', deploymentFallbackConfigured: false },
        openai: { state: 'none', deploymentFallbackConfigured: false },
        voyage: { state: 'none', deploymentFallbackConfigured: false },
      },
    });
    render(<AiCredentialsSection />);
    for (const input of screen.getAllByPlaceholderText(/••••4242|Paste the key/)) {
      expect((input as HTMLInputElement).value).toBe('');
    }
  });

  it('masks the field so a shoulder-surfer cannot read a pasted key', () => {
    statusValue = status({ canEditInstall: true });
    render(<AiCredentialsSection />);
    const inputs = screen.getAllByPlaceholderText('Paste the key');
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) expect(input).toHaveAttribute('type', 'password');
  });
});

describe('scope and inheritance messaging', () => {
  it('tells a company it is inheriting the deployment key, and how to stop', () => {
    settingsValue = { activeCompanyId: 'company_1' };
    statusValue = status({
      scope: { kind: 'company', companyId: 'company_1', companyName: 'Acme Aviation' },
      canEdit: true,
      providers: {
        anthropic: { state: 'install', last4: '9f21', deploymentFallbackConfigured: true },
        openai: { state: 'none', deploymentFallbackConfigured: false },
        voyage: { state: 'none', deploymentFallbackConfigured: false },
      },
    });
    render(<AiCredentialsSection />);

    expect(screen.getByText(/Acme Aviation keys/)).toBeInTheDocument();
    expect(screen.getAllByText(/Inherited/).length).toBeGreaterThan(0);
    expect(screen.getByText(/bill your own/i)).toBeInTheDocument();
  });

  it('warns when nothing is configured anywhere', () => {
    settingsValue = { activeCompanyId: 'company_1' };
    statusValue = status({
      scope: { kind: 'company', companyId: 'company_1', companyName: 'Acme' },
      canEdit: true,
    });
    render(<AiCredentialsSection />);
    expect(screen.getAllByText(/will not work until one is added/i).length).toBeGreaterThan(0);
  });

  it('explains the empty state when the user is in no company', () => {
    statusValue = status();
    render(<AiCredentialsSection />);
    expect(screen.getByText(/not working in a company workspace/i)).toBeInTheDocument();
  });
});

describe('permissions', () => {
  it('hides the editor from a member who is not a company admin', () => {
    settingsValue = { activeCompanyId: 'company_1' };
    statusValue = status({
      scope: { kind: 'company', companyId: 'company_1', companyName: 'Acme' },
      canEdit: false,
    });
    render(<AiCredentialsSection />);

    // Still registered for everyone, so they can see WHY AI is failing...
    expect(screen.getAllByText(/Only a company admin can change this key/i).length).toBeGreaterThan(0);
    // ...but there is nothing to save with.
    expect(screen.queryByRole('button', { name: /Save and test/i })).not.toBeInTheDocument();
  });

  it('shows the deployment-default panel only to platform staff', () => {
    statusValue = status({ canEditInstall: false });
    const { rerender, container } = render(<AiCredentialsSection />);
    expect(container.textContent).not.toContain('Deployment default');

    statusValue = status({ canEditInstall: true });
    rerender(<AiCredentialsSection />);
    expect(screen.getByText('Deployment default')).toBeInTheDocument();
  });
});

describe('provider selection', () => {
  it('offers exactly one embedding provider — the deployment-wide one', () => {
    // EMBEDDING_DIMENSIONS is baked into the vector index, so a per-company
    // provider choice would mix embedding spaces. Offering both would invite it.
    statusValue = status({ canEditInstall: true, embeddingProvider: 'voyage' });
    const { container } = render(<AiCredentialsSection />);
    expect(container.textContent).toContain('Voyage');
    expect(container.textContent).not.toContain('OpenAI');
  });

  it('follows the deployment when it is configured for OpenAI', () => {
    statusValue = status({ canEditInstall: true, embeddingProvider: 'openai' });
    const { container } = render(<AiCredentialsSection />);
    expect(container.textContent).toContain('OpenAI');
    expect(container.textContent).not.toContain('Voyage');
  });
});

describe('saving', () => {
  it('saves, verifies, and clears the field in one action', async () => {
    const user = userEvent.setup();
    statusValue = status({ canEditInstall: true });
    render(<AiCredentialsSection />);

    const input = screen.getAllByPlaceholderText('Paste the key')[0] as HTMLInputElement;
    await user.type(input, 'sk-ant-api03-not-a-real-key-000000');
    await user.click(screen.getAllByRole('button', { name: /Save and test/i })[0]);

    await waitFor(() => expect(setInstallCredential).toHaveBeenCalledTimes(1));
    expect(setInstallCredential.mock.calls[0][0]).toMatchObject({
      provider: 'anthropic',
      apiKey: 'sk-ant-api03-not-a-real-key-000000',
    });
    // Saving runs the probe, so a typo surfaces now rather than on the next run.
    await waitFor(() => expect(testCredential).toHaveBeenCalled());
    // The field is not a display of stored state; leaving the key on screen
    // serves no purpose.
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('will not submit an empty field', async () => {
    statusValue = status({ canEditInstall: true });
    render(<AiCredentialsSection />);
    expect(screen.getAllByRole('button', { name: /Save and test/i })[0]).toBeDisabled();
  });

  it('surfaces a rejected key instead of reporting success', async () => {
    const user = userEvent.setup();
    testCredential.mockResolvedValueOnce({
      ok: false,
      message: 'The key was rejected by Anthropic. Check for a typo, or a key that has been revoked.',
    });
    statusValue = status({ canEditInstall: true });
    render(<AiCredentialsSection />);

    await user.type(
      screen.getAllByPlaceholderText('Paste the key')[0],
      'sk-ant-api03-wrong-key-00000000000',
    );
    await user.click(screen.getAllByRole('button', { name: /Save and test/i })[0]);

    expect(await screen.findByText(/rejected by Anthropic/i)).toBeInTheDocument();
  });

  it('reports a save failure rather than failing silently', async () => {
    const user = userEvent.setup();
    setInstallCredential.mockRejectedValueOnce(new Error('That does not look like an API key - it is too short.'));
    statusValue = status({ canEditInstall: true });
    render(<AiCredentialsSection />);

    await user.type(screen.getAllByPlaceholderText('Paste the key')[0], 'sk-ant-shortish-key-x');
    await user.click(screen.getAllByRole('button', { name: /Save and test/i })[0]);

    expect(await screen.findByText(/does not look like an API key/i)).toBeInTheDocument();
  });
});

describe('removal', () => {
  it('confirms before removing a stored key', async () => {
    const user = userEvent.setup();
    statusValue = status({
      canEditInstall: true,
      providers: {
        anthropic: { state: 'install', last4: '4242', deploymentFallbackConfigured: false },
        openai: { state: 'none', deploymentFallbackConfigured: false },
        voyage: { state: 'none', deploymentFallbackConfigured: false },
      },
    });
    render(<AiCredentialsSection />);

    await user.click(screen.getAllByRole('button', { name: /^Remove$/i })[0]);
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(removeInstallCredential).toHaveBeenCalledTimes(1));
  });

  it('does nothing when the confirmation is declined', async () => {
    const user = userEvent.setup();
    confirmDialog.mockResolvedValueOnce(false);
    statusValue = status({
      canEditInstall: true,
      providers: {
        anthropic: { state: 'install', last4: '4242', deploymentFallbackConfigured: false },
        openai: { state: 'none', deploymentFallbackConfigured: false },
        voyage: { state: 'none', deploymentFallbackConfigured: false },
      },
    });
    render(<AiCredentialsSection />);

    await user.click(screen.getAllByRole('button', { name: /^Remove$/i })[0]);
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(removeInstallCredential).not.toHaveBeenCalled();
  });

  it('offers no Remove button when there is nothing stored at this scope', () => {
    statusValue = status({ canEditInstall: true });
    render(<AiCredentialsSection />);
    expect(screen.queryByRole('button', { name: /^Remove$/i })).not.toBeInTheDocument();
  });
});

describe('removal warns about the right consequence', () => {
  const stored = {
    anthropic: { state: 'install' as const, last4: '4242', deploymentFallbackConfigured: false },
    openai: { state: 'none' as const, deploymentFallbackConfigured: false },
    voyage: { state: 'none' as const, deploymentFallbackConfigured: false },
  };

  it('tells a company it falls back to the deployment default', async () => {
    const user = userEvent.setup();
    settingsValue = { activeCompanyId: 'company_1' };
    statusValue = status({
      scope: { kind: 'company', companyId: 'company_1', companyName: 'Acme' },
      canEdit: true,
      providers: { ...stored, anthropic: { ...stored.anthropic, state: 'company' } },
    });
    render(<AiCredentialsSection />);

    await user.click(screen.getAllByRole('button', { name: /^Remove$/i })[0]);
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(confirmDialog.mock.calls[0][0].message).toMatch(/deployment's default key/);
  });

  it('does NOT tell the deployment default it falls back to itself', async () => {
    // Removing the deployment default cannot "fall back to this deployment's
    // built-in key" — it IS that key. Only the server environment is left.
    const user = userEvent.setup();
    statusValue = status({ canEditInstall: true, providers: stored });
    render(<AiCredentialsSection />);

    await user.click(screen.getAllByRole('button', { name: /^Remove$/i })[0]);
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    const message = confirmDialog.mock.calls[0][0].message;
    expect(message).toMatch(/server's environment/);
    expect(message).not.toMatch(/deployment's (default|built-in) key/);
  });

  it('names the provider in the title', async () => {
    const user = userEvent.setup();
    statusValue = status({ canEditInstall: true, providers: stored });
    render(<AiCredentialsSection />);
    await user.click(screen.getAllByRole('button', { name: /^Remove$/i })[0]);
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(confirmDialog.mock.calls[0][0].title).toContain('Anthropic');
  });
});
