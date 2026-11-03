import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import ErrorBoundary from '../../components/ErrorBoundary';

vi.mock('../../services/sentry', () => ({ captureException: vi.fn() }));

function Boom(): never {
  throw new Error('page crashed');
}

let goTo: (path: string) => void = () => {};
function NavHandle() {
  const navigate = useNavigate();
  goTo = (path) => {
    window.history.pushState({}, '', path);
    navigate(path);
  };
  return null;
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
        <NavHandle />
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

    goTo('/fine');
    expect(await screen.findByText('Fine page')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
