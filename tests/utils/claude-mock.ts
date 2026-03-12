import { Page, Route } from '@playwright/test';

const DEFAULT_JSON_RESPONSE = {
  content: [
    {
      type: 'text',
      text: 'This is a mocked AI response for testing. The analysis indicates full compliance with all reviewed regulatory requirements. No findings or discrepancies were identified during this review.',
    },
  ],
  stop_reason: 'end_turn',
};

function buildSSEStream(text: string): string {
  const deltaEvent = JSON.stringify({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text },
  });
  const doneEvent = JSON.stringify({
    type: 'done',
    message: {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    },
  });
  return `data: ${deltaEvent}\n\ndata: ${doneEvent}\n\n`;
}

/**
 * Intercept all `/api/claude` calls on the page. Returns deterministic mocked
 * responses for both JSON and streaming (SSE) modes.
 *
 * Optionally pass a `responseText` to customise the AI output.
 */
export async function mockClaude(
  page: Page,
  options?: { responseText?: string },
): Promise<void> {
  const text = options?.responseText ?? DEFAULT_JSON_RESPONSE.content[0].text;

  await page.route('**/api/claude**', async (route: Route) => {
    const url = route.request().url();
    const isStream = url.includes('stream=true');

    if (isStream) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildSSEStream(text),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
        }),
      });
    }
  });
}

/**
 * Intercept eCFR proxy calls with mock regulatory text.
 */
export async function mockEcfr(page: Page): Promise<void> {
  await page.route('**/api/ecfr**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        citation: '14 CFR 145.211',
        text: 'Mock regulatory text for testing purposes.',
        fetchedAt: new Date().toISOString(),
      }),
    });
  });
}
