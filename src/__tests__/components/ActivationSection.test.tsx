import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildLicenseKey } from '../../services/licenseKey';

/**
 * The activation panel.
 *
 * What is tested here is mostly commercial rather than technical: that an
 * unlicensed install still reads as a working product, that an expired one says
 * plainly the customer's records are still theirs, and that a mistyped key is
 * caught before it becomes a support ticket.
 *
 * The panel talks to two local HTTP endpoints rather than Convex, so `fetch` is
 * the only thing that needs mocking.
 */
const ActivationSection = (await import('../../components/settings/sections/ActivationSection'))
  .default;

const VALID_KEY = buildLicenseKey('AG7K2M9P4QR3TVW');

const UNLICENSED = {
  enabledFeatures: [],
  tier: 'unlicensed',
  state: 'unlicensed',
  lastCheckInAt: null,
  reason: 'No license has been activated. Add one under Settings > Activation.',
};

const LICENSED = {
  enabledFeatures: ['ai.analysis'],
  tier: 'professional',
  state: 'licensed',
  lastCheckInAt: Date.now(),
  reason: 'Active subscription.',
};

const EXPIRED = {
  enabledFeatures: [],
  tier: 'professional',
  state: 'expired',
  lastCheckInAt: Date.now() - 40 * 86_400_000,
  reason: 'This license has not been confirmed in over 30 days.',
};

/** Respond to /api/entitlements with `state`, and to /api/activate with `onActivate`. */
function mockFetch(state: unknown, onActivate?: (body: unknown) => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/api/activate')) {
      const body = JSON.parse(String(init?.body || '{}'));
      const result = onActivate ? onActivate(body) : LICENSED;
      if (result === null) {
        return new Response(JSON.stringify({ error: 'That license key is not recognised.' }), {
          status: 400,
        });
      }
      return new Response(JSON.stringify(result), { status: 200 });
    }
    if (state === null) return new Response('', { status: 404 });
    return new Response(JSON.stringify(state), { status: 200 });
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch(UNLICENSED));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('what an unlicensed install is told', () => {
  it('reads as not-yet-activated, never as disabled', () => {
    // An unlicensed install is a working product. Wording that implies the
    // software is switched off would be both wrong and a bad first impression.
    render(<ActivationSection />);
    return waitFor(() => {
      expect(screen.getByText('Not activated')).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/disabled|locked|expired/i);
    });
  });

  it('points at bring-your-own-key as a real alternative', async () => {
    render(<ActivationSection />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/AeroGap works without one/i);
      expect(document.body.textContent).toMatch(/AI Keys/);
    });
  });
});

describe('what an expired install is told', () => {
  it('says the records are still readable and exportable', async () => {
    // The most important sentence in the panel. A shop that believes its own
    // maintenance records are held hostage by a billing server is a customer
    // lost permanently, and the fear is reasonable unless it is answered.
    vi.stubGlobal('fetch', mockFetch(EXPIRED));
    render(<ActivationSection />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/records remain fully readable and exportable/i);
    });
  });

  it('does not present expiry as a lockout', async () => {
    vi.stubGlobal('fetch', mockFetch(EXPIRED));
    render(<ActivationSection />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Only AI features are paused/i);
    });
  });
});

describe('entering a key', () => {
  it('catches a typo locally, without calling the server', async () => {
    const fetchMock = mockFetch(UNLICENSED);
    vi.stubGlobal('fetch', fetchMock);
    render(<ActivationSection />);
    await screen.findByText('Not activated');

    const input = screen.getByPlaceholderText(/AGXX/i);
    // Valid shape, one character wrong: only the checksum can catch this.
    const mistyped = VALID_KEY.slice(0, 8) + (VALID_KEY[8] === '2' ? '3' : '2') + VALID_KEY.slice(9);
    await userEvent.type(input, mistyped);
    await userEvent.click(screen.getByRole('button', { name: /^Activate$/i }));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/mistyped/i);
    });
    // The whole point: no round trip, so no "the server rejected your key".
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/activate'))).toHaveLength(0);
  });

  it('sends a well-formed key and reports success', async () => {
    const fetchMock = mockFetch(UNLICENSED, () => LICENSED);
    vi.stubGlobal('fetch', fetchMock);
    render(<ActivationSection />);
    await screen.findByText('Not activated');

    await userEvent.type(screen.getByPlaceholderText(/AGXX/i), VALID_KEY);
    await userEvent.click(screen.getByRole('button', { name: /^Activate$/i }));

    await waitFor(() => expect(screen.getByText(/License activated/i)).toBeInTheDocument());

    const activateCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/activate'));
    expect(activateCall).toBeDefined();
    expect(JSON.parse(String((activateCall![1] as RequestInit).body)).licenseKey).toBe(VALID_KEY);
  });

  it('accepts a key typed with dashes and lower case', async () => {
    const fetchMock = mockFetch(UNLICENSED, () => LICENSED);
    vi.stubGlobal('fetch', fetchMock);
    render(<ActivationSection />);
    await screen.findByText('Not activated');

    const grouped = (VALID_KEY.match(/.{1,4}/g) || []).join('-').toLowerCase();
    await userEvent.type(screen.getByPlaceholderText(/AGXX/i), grouped);
    await userEvent.click(screen.getByRole('button', { name: /^Activate$/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/activate'));
      // Normalised before sending, so the server sees one canonical form.
      expect(JSON.parse(String((call![1] as RequestInit).body)).licenseKey).toBe(VALID_KEY);
    });
  });

  it('does NOT claim success when the server saved but could not confirm', async () => {
    // Saying "activated" here would be a lie the customer discovers later, when
    // the features they just paid for are still unavailable.
    vi.stubGlobal('fetch', mockFetch(UNLICENSED, () => UNLICENSED));
    render(<ActivationSection />);
    await screen.findByText('Not activated');

    await userEvent.type(screen.getByPlaceholderText(/AGXX/i), VALID_KEY);
    await userEvent.click(screen.getByRole('button', { name: /^Activate$/i }));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/could not confirm it yet/i);
      expect(document.body.textContent).not.toMatch(/License activated/i);
    });
  });

  it('surfaces a server rejection without inventing a reason', async () => {
    vi.stubGlobal('fetch', mockFetch(UNLICENSED, () => null));
    render(<ActivationSection />);
    await screen.findByText('Not activated');

    await userEvent.type(screen.getByPlaceholderText(/AGXX/i), VALID_KEY);
    await userEvent.click(screen.getByRole('button', { name: /^Activate$/i }));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/not recognised/i);
    });
  });
});

describe('on the hosted product', () => {
  it('renders nothing when there is no local licensing service', async () => {
    // /api/entitlements only exists on a self-hosted or desktop install. Its
    // absence is normal, not an error to show anyone.
    vi.stubGlobal('fetch', mockFetch(null));
    const { container } = render(<ActivationSection />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when the endpoint cannot be reached at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));
    const { container } = render(<ActivationSection />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
