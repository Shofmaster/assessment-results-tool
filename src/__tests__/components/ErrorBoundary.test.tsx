import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import ErrorBoundary from '../../components/ErrorBoundary';

vi.mock('../../services/sentry', () => ({ captureException: vi.fn() }));

function Boom(): never {
  throw new Error('page crashed');
}

function NavButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        window.history.pushState({}, '', to);
        navigate(to);
      }}
    >
      Go to {to}
    </button>
  );
}

afterEach(() => {
  window.history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('clears a crash when the user navigates to another page', async () => {
    // Every route renders its own <ErrorBoundary> at the same position under
    // <Routes>, so React reuses one instance; the error must not follow the user.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.pushState({}, '', '/broken');

    render(
      <MemoryRouter initialEntries={['/broken']}>
        <NavButton to="/fine" />
        <Routes>
          <Route
            path="/broken"
            element={
              <ErrorBoundary>
                <Boom />
              </ErrorBoundary>
            }
          />
          <Route
            path="/fine"
            element={
              <ErrorBoundary>
                <p>Fine page</p>
              </ErrorBoundary>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to /fine' }));
    expect(await screen.findByText('Fine page')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
