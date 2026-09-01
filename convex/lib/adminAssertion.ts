"use node";

/**
 * Proof that a privileged local-auth call was made by the app server after
 * verifying the user's session — not by a client holding only the service token.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { timingSafeEqualStr } from "./serviceToken";

export function buildAdminAssertion(serviceToken: string, callerSubject: string): string {
  return createHmac("sha256", serviceToken.trim())
    .update(`admin-reset:${callerSubject}`)
    .digest("base64url");
}

export function verifyAdminAssertion(
  serviceToken: string,
  callerSubject: string,
  assertion: string | null | undefined,
): boolean {
  const token = (serviceToken || "").trim();
  const subject = (callerSubject || "").trim();
  const provided = (assertion || "").trim();
  if (!token || !subject || !provided) return false;

  const expected = buildAdminAssertion(token, subject);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/** @internal re-export for tests */
export { timingSafeEqualStr };
