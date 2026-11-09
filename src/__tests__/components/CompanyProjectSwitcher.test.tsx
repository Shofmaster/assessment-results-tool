import { describe, it, expect, vi, onTestFinished } from 'vitest';
import { flushSync } from 'react-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

/**
 * "New Project" in the company/project dropdown used to close the dropdown
 * instead of showing the name input: the click swapped the button for the input
 * before the document-level outside-click listener ran, so the clicked element
 * was detached and counted as "outside".
 */
vi.mock('../../hooks/useConvexData', () => ({
  useCompaniesForCurrentUser: () => [{ _id: 'c1', name: 'ZZ Test Co' }],
  useCreateProject: () => vi.fn(),
  useDeleteProject: () => vi.fn(),
  useIsAerogapEmployee: () => false,
  useProjects: () => [{ _id: 'p1', name: 'Test Project A', companyId: 'c1' }],
  useUpsertUserSettings: () => vi.fn().mockResolvedValue(undefined),
  useUserSettings: () => ({ activeCompanyId: 'c1' }),
}));
vi.mock('../../components/confirm/ConfirmDialogProvider', () => ({
  useConfirmDialog: () => vi.fn().mockResolvedValue(true),
}));

const { CompanyProjectSwitcher } = await import('../../components/CompanyProjectSwitcher');

describe('CompanyProjectSwitcher: New Project', () => {
  it('shows the project name input instead of closing the dropdown', async () => {
    // In a browser, React's update from a real click is flushed in the microtask
    // checkpoint between event listeners, i.e. before the click reaches the
    // document. A scripted dispatchEvent has no such checkpoint, so flush React
    // from a body listener (between React's root and the document) to match.
    const flushBetweenListeners = () => flushSync(() => {});
    document.body.addEventListener('click', flushBetweenListeners);
    onTestFinished(() => document.body.removeEventListener('click', flushBetweenListeners));

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CompanyProjectSwitcher isDarkMode mobileOpen={false} scopeLevel={'ok' as any} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { expanded: false }));
    await user.click(screen.getByRole('button', { name: /new project/i }));

    expect(screen.getByPlaceholderText('Project name...')).toBeInTheDocument();
  });

  it('still closes when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <div>
          <p>outside</p>
          <CompanyProjectSwitcher isDarkMode mobileOpen={false} scopeLevel={'ok' as any} />
        </div>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
    await user.click(screen.getByText('outside'));
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument();
  });
});
