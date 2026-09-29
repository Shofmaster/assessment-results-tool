import { describe, expect, it } from 'vitest';
import { missingServiceTokenMessage } from '../../../../convex/lib/serviceToken';
import { userFacingReviewCallError } from './reviewClient';

describe('userFacingReviewCallError credential token', () => {
  it('expands a short missing-token error into operator instructions', () => {
    const message = userFacingReviewCallError(
      new Error('AI credential lookup is not configured: AI_CREDENTIAL_SERVICE_TOKEN is not set.'),
    );
    expect(message).toBe(missingServiceTokenMessage());
    expect(message).toMatch(/Vercel/);
    expect(message).toMatch(/convex env set AI_CREDENTIAL_SERVICE_TOKEN/);
    expect(message).toMatch(/Desktop \/ self-host/);
    expect(message).toMatch(/Do not commit the token/);
    expect(message).not.toMatch(/sk-ant-|sk_live_|[A-Za-z0-9_-]{40,}/);
  });

  it('keeps a server message that already says where to set the token', () => {
    const server = missingServiceTokenMessage();
    expect(userFacingReviewCallError(new Error(server))).toBe(server);
  });

  it('names Convex when the deployment itself is missing the token', () => {
    const server =
      'AI credential lookup is not configured: AI_CREDENTIAL_SERVICE_TOKEN is not set in the Convex deployment. ' +
      'Cloud: `npx convex env set AI_CREDENTIAL_SERVICE_TOKEN <value> --prod`. Desktop / self-host: re-run bootstrap.mjs.';
    expect(userFacingReviewCallError(new Error(server))).toBe(server);
  });
});
