import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Passwords on a self-hosted install.
 *
 * This screen matters more than it looks: there is no password-reset email on
 * this product, by design, so an administrator with this form is the ONLY
 * recovery path. Without it, a forgotten password on a customer's machine ends
 * in a command line.
 *
 * The tests below concentrate on the two ways this can go quietly wrong: a
 * mistyped new password locking someone out of their own account, and an
 * administrator resetting a password without realising nobody will be told.
 */
let isAdmin = false;
vi.mock('../../hooks/useConvexData', () => ({
  useIsAdmin: () => isAdmin,
}));

const AccountSecuritySection = (
  await import('../../components/settings/sections/AccountSecuritySection')
).default;

let lastRequest: { path: string; body: any } | null = null;
let response: { ok: boolean; body: unknown };

beforeEach(() => {
  isAdmin = false;
  lastRequest = null;
  response = { ok: true, body: { ok: true } };
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    lastRequest = { path: String(path), body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify(response.body), { status: response.ok ? 200 : 400 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The three password boxes in the "your password" card, in order. */
function passwordInputs() {
  return Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
}

describe('changing your own password', () => {
  it('sends the current and new password to the server', async () => {
    render(<AccountSecuritySection />);
    const [current, next, confirm] = passwordInputs();

    await userEvent.type(current, 'my old passphrase');
    await userEvent.type(next, 'my brand new passphrase');
    await userEvent.type(confirm, 'my brand new passphrase');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(lastRequest?.path).toBe('/local-auth/change-password'));
    expect(lastRequest?.body).toEqual({
      currentPassword: 'my old passphrase',
      newPassword: 'my brand new passphrase',
    });
  });

  it('REFUSES a mismatched confirmation without calling the server', async () => {
    // The failure this prevents is the worst one available on this product: a
    // password changed to something the user did not intend, on a system with
    // no reset email to recover through.
    render(<AccountSecuritySection />);
    const [current, next, confirm] = passwordInputs();

    await userEvent.type(current, 'my old passphrase');
    await userEvent.type(next, 'my brand new passphrase');
    await userEvent.type(confirm, 'my brand new passphrasx');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/do not match/i));
    expect(lastRequest).toBeNull();
  });

  it('applies the length rule locally, so the answer is instant', async () => {
    render(<AccountSecuritySection />);
    const [current, next, confirm] = passwordInputs();

    await userEvent.type(current, 'my old passphrase');
    await userEvent.type(next, 'short');
    await userEvent.type(confirm, 'short');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/at least 12/i));
    expect(lastRequest).toBeNull();
  });

  it('surfaces the server’s reason rather than inventing one', async () => {
    response = { ok: false, body: { error: 'Your current password is not correct.' } };
    render(<AccountSecuritySection />);
    const [current, next, confirm] = passwordInputs();

    await userEvent.type(current, 'wrong old passphrase');
    await userEvent.type(next, 'my brand new passphrase');
    await userEvent.type(confirm, 'my brand new passphrase');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/current password is not correct/i),
    );
  });

  it('clears the fields after a successful change', async () => {
    // Leaving a password sitting in a form field on a shared workshop machine
    // is exactly the kind of small thing that becomes a real problem.
    render(<AccountSecuritySection />);
    const [current, next, confirm] = passwordInputs();

    await userEvent.type(current, 'my old passphrase');
    await userEvent.type(next, 'my brand new passphrase');
    await userEvent.type(confirm, 'my brand new passphrase');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(screen.getByText(/password has been changed/i)).toBeInTheDocument());
    expect(current.value).toBe('');
    expect(next.value).toBe('');
    expect(confirm.value).toBe('');
  });
});

describe('the administrator reset form', () => {
  it('is not shown to an ordinary user', async () => {
    isAdmin = false;
    render(<AccountSecuritySection />);
    expect(screen.queryByText(/reset someone else/i)).toBeNull();
  });

  it('is shown to an administrator', async () => {
    isAdmin = true;
    render(<AccountSecuritySection />);
    expect(screen.getByText(/reset someone else/i)).toBeInTheDocument();
  });

  it('posts the target address and the new password', async () => {
    isAdmin = true;
    render(<AccountSecuritySection />);

    await userEvent.type(
      screen.getByPlaceholderText('mechanic@yourcompany.com'),
      'sam@shop.local',
    );
    // Deliberately a text input, not a password one - see below.
    const temp = document.querySelector('input.font-mono') as HTMLInputElement;
    await userEvent.type(temp, 'temporary passphrase');
    await userEvent.click(screen.getByRole('button', { name: /reset their password/i }));

    await waitFor(() => expect(lastRequest?.path).toBe('/local-auth/admin-reset'));
    expect(lastRequest?.body).toEqual({
      targetEmail: 'sam@shop.local',
      newPassword: 'temporary passphrase',
    });
  });

  it('shows the new password rather than masking it', async () => {
    // The administrator has to read this value out to the person. A masked
    // field they cannot see is how a typo becomes a SECOND locked-out account.
    isAdmin = true;
    render(<AccountSecuritySection />);
    const temp = document.querySelector('input.font-mono') as HTMLInputElement;
    expect(temp.type).toBe('text');
  });

  it('tells the administrator that no email is sent', async () => {
    // Without this, a reset silently succeeds and the user is never told - the
    // administrator assumes the system did it, and nobody follows up.
    isAdmin = true;
    render(<AccountSecuritySection />);

    await userEvent.type(
      screen.getByPlaceholderText('mechanic@yourcompany.com'),
      'sam@shop.local',
    );
    const temp = document.querySelector('input.font-mono') as HTMLInputElement;
    await userEvent.type(temp, 'temporary passphrase');
    await userEvent.click(screen.getByRole('button', { name: /reset their password/i }));

    await waitFor(() => expect(document.body.textContent).toMatch(/no email is sent/i));
  });

  it('reports a refusal from the server', async () => {
    // Hiding the form from non-admins is presentation; the server is what
    // actually decides, and its answer has to reach the screen.
    isAdmin = true;
    response = {
      ok: false,
      body: { error: "Only an administrator can reset another user's password." },
    };
    render(<AccountSecuritySection />);

    await userEvent.type(
      screen.getByPlaceholderText('mechanic@yourcompany.com'),
      'sam@shop.local',
    );
    const temp = document.querySelector('input.font-mono') as HTMLInputElement;
    await userEvent.type(temp, 'temporary passphrase');
    await userEvent.click(screen.getByRole('button', { name: /reset their password/i }));

    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((el) => /only an administrator/i.test(el.textContent || '')),
      ).toBe(true),
    );
  });
});
