import { useCallback, useState } from 'react';
import { FiKey, FiShield } from 'react-icons/fi';
import { Button, Field, Input, SettingsCard } from '../../ui';
import { useIsAdmin } from '../../../hooks/useConvexData';

/**
 * Passwords, on an installation that issues its own identities.
 *
 * WHY THIS SCREEN IS NOT OPTIONAL
 * There is no password-reset email here, by design: an install may never touch
 * the internet, and an unauthenticated reset endpoint would be an easier way in
 * than the password itself. That makes an administrator with a reset form the
 * ONLY recovery path. Without this screen, a forgotten password on a customer's
 * machine is a support call that ends in a command line.
 *
 * Rendered only on a local-auth deployment. The hosted product uses Clerk, which
 * has its own flows, and showing a second set would be actively confusing.
 *
 * AUTHORISATION IS NOT DECIDED HERE. The admin panel is hidden from non-admins
 * as a courtesy, but the server checks the caller's role independently - hiding
 * a form is presentation, not security.
 */

const MIN_PASSWORD_LENGTH = 12;

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // A non-JSON body means the server is restarting; status is enough.
  }
  return { ok: response.ok, body: parsed as { error?: string } | null };
}

export default function AccountSecuritySection() {
  const isAdmin = useIsAdmin();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ownError, setOwnError] = useState<string | null>(null);
  const [ownSuccess, setOwnSuccess] = useState<string | null>(null);
  const [ownBusy, setOwnBusy] = useState(false);

  const [targetEmail, setTargetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const changeOwn = useCallback(async () => {
    setOwnError(null);
    setOwnSuccess(null);

    // Checked here purely so the message arrives instantly; the server applies
    // the same rule and is what actually enforces it.
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setOwnError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    // A mistyped new password would otherwise lock the person out of their own
    // account with no reset email to fall back on.
    if (newPassword !== confirmPassword) {
      setOwnError('The two new passwords do not match.');
      return;
    }

    setOwnBusy(true);
    try {
      const result = await post('/local-auth/change-password', { currentPassword, newPassword });
      if (!result.ok) {
        setOwnError(result.body?.error || 'The password could not be changed.');
        return;
      }
      setOwnSuccess('Your password has been changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setOwnError('Could not reach this machine’s AeroGap service.');
    } finally {
      setOwnBusy(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const resetOther = useCallback(async () => {
    setResetError(null);
    setResetSuccess(null);

    if (resetPassword.length < MIN_PASSWORD_LENGTH) {
      setResetError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setResetBusy(true);
    try {
      const result = await post('/local-auth/admin-reset', {
        targetEmail,
        newPassword: resetPassword,
      });
      if (!result.ok) {
        setResetError(result.body?.error || 'The password could not be reset.');
        return;
      }
      // The administrator now has to tell them, and the copy says so - there is
      // no email, so an unstated assumption here means the user never finds out.
      setResetSuccess(
        `Password reset for ${targetEmail}. Tell them their new password directly — no email is sent.`,
      );
      setTargetEmail('');
      setResetPassword('');
    } catch {
      setResetError('Could not reach this machine’s AeroGap service.');
    } finally {
      setResetBusy(false);
    }
  }, [targetEmail, resetPassword]);

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Your password"
        description="Your account lives on this machine. Changing it here takes effect immediately."
        icon={<FiKey />}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ownBusy) void changeOwn();
          }}
        >
          <Field label="Current password">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="New password"
            help={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase you can remember is stronger than a short complicated word.`}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            )}
          </Field>

          <Field label="Confirm new password">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            )}
          </Field>

          {ownError && (
            <p role="alert" className="text-sm text-rose-300">
              {ownError}
            </p>
          )}
          {ownSuccess && <p className="text-sm text-emerald-300">{ownSuccess}</p>}

          <Button type="submit" disabled={ownBusy || !currentPassword || !newPassword}>
            {ownBusy ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      </SettingsCard>

      {isAdmin && (
        <SettingsCard
          title="Reset someone else’s password"
          description="Administrators only. This is the recovery path on this installation — there is no reset email."
          icon={<FiShield />}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!resetBusy) void resetOther();
            }}
          >
            <Field
              label="Their email address"
              help="The account must already exist on this installation."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="email"
                  autoComplete="off"
                  value={targetEmail}
                  onChange={(event) => setTargetEmail(event.target.value)}
                  placeholder="mechanic@yourcompany.com"
                />
              )}
            </Field>

            <Field
              label="New password for them"
              help="Choose something temporary and ask them to change it once they are in."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="text"
                  // NOT type=password: the administrator has to read this value
                  // out to the person, and a masked field they cannot see is how
                  // a typo becomes a second locked-out account.
                  autoComplete="off"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  className="font-mono"
                />
              )}
            </Field>

            {resetError && (
              <p role="alert" className="text-sm text-rose-300">
                {resetError}
              </p>
            )}
            {resetSuccess && <p className="text-sm text-emerald-300">{resetSuccess}</p>}

            <Button
              type="submit"
              variant="secondary"
              disabled={resetBusy || !targetEmail || !resetPassword}
            >
              {resetBusy ? 'Resetting…' : 'Reset their password'}
            </Button>
          </form>
        </SettingsCard>
      )}
    </div>
  );
}
