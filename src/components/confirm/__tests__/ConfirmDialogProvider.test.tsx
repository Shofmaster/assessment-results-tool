import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialogProvider, useConfirmDialog, type ConfirmDialogOptions } from '../ConfirmDialogProvider';

/** Trigger that opens a confirm dialog and reports the resolved boolean. */
function Trigger({ options, onResult }: { options: ConfirmDialogOptions; onResult: (r: boolean) => void }) {
  const confirm = useConfirmDialog();
  return (
    <button type="button" onClick={async () => onResult(await confirm(options))}>
      trigger
    </button>
  );
}

function setup(options: ConfirmDialogOptions) {
  const onResult = vi.fn();
  render(
    <ConfirmDialogProvider>
      <Trigger options={options} onResult={onResult} />
    </ConfirmDialogProvider>,
  );
  return { onResult, user: userEvent.setup() };
}

describe('ConfirmDialogProvider', () => {
  it('resolves true when the user confirms', async () => {
    const { onResult, user } = setup({ message: 'Delete widget?', confirmLabel: 'Delete' });
    await user.click(screen.getByRole('button', { name: 'trigger' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete widget?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    // dialog closes after settling
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('resolves false when the user cancels', async () => {
    const { onResult, user } = setup({ message: 'Proceed?' });
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('resolves false when dismissed with Escape', async () => {
    const { onResult, user } = setup({ message: 'Proceed?' });
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('gates the confirm button behind an exact type-to-confirm match', async () => {
    const { onResult, user } = setup({
      message: 'Delete project?',
      confirmLabel: 'Delete project',
      requireText: 'my-project',
    });
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await screen.findByRole('dialog');

    const confirmBtn = screen.getByRole('button', { name: 'Delete project' });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByRole('textbox');
    await user.type(input, 'wrong');
    expect(confirmBtn).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'my-project');
    expect(confirmBtn).toBeEnabled();

    await user.click(confirmBtn);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('uses default labels when none are supplied', async () => {
    const { user } = setup({ message: 'Anything?' });
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });
});
