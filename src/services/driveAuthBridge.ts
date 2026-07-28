/**
 * Bridge so the non-React GoogleDriveService can exchange GIS auth codes and
 * mint access tokens via Convex without importing React. AuthGate (or any
 * signed-in shell) registers the binders; services call the getters.
 */
export type DriveAccessToken = { accessToken: string; expiresIn: number };

type ExchangeCodeFn = (code: string) => Promise<DriveAccessToken>;
type GetAccessTokenFn = () => Promise<DriveAccessToken | null>;
type DisconnectFn = () => Promise<void>;

let exchangeCodeFn: ExchangeCodeFn | null = null;
let getAccessTokenFn: GetAccessTokenFn | null = null;
let disconnectFn: DisconnectFn | null = null;

/** Bumped on every bridge register/clear so deferred clears don't wipe a newer link. */
let bridgeGeneration = 0;

/** Resolvers waiting for AuthGate to register the bridge (mount race). */
const readyWaiters: Array<() => void> = [];

function notifyBridgeReady(): void {
  while (readyWaiters.length > 0) {
    readyWaiters.shift()?.();
  }
}

export function setDriveAuthBridge(bridge: {
  exchangeCode: ExchangeCodeFn | null;
  getAccessToken: GetAccessTokenFn | null;
  disconnect: DisconnectFn | null;
}): void {
  bridgeGeneration += 1;
  exchangeCodeFn = bridge.exchangeCode;
  getAccessTokenFn = bridge.getAccessToken;
  disconnectFn = bridge.disconnect;
  if (getAccessTokenFn) notifyBridgeReady();
}

/**
 * Clear the bridge after a short delay. Cancelling the returned function (or
 * calling setDriveAuthBridge again) prevents the clear — so brief Convex auth
 * flaps don't race an in-flight getAccessToken mint.
 */
export function clearDriveAuthBridgeDeferred(delayMs = 2_500): () => void {
  const genAtSchedule = bridgeGeneration;
  const timer = setTimeout(() => {
    if (bridgeGeneration !== genAtSchedule) return;
    setDriveAuthBridge({ exchangeCode: null, getAccessToken: null, disconnect: null });
  }, delayMs);
  return () => clearTimeout(timer);
}

/** Wait until AuthGate has wired Convex Drive auth (or timeout). */
export function waitForDriveAuthBridge(timeoutMs = 8_000): Promise<boolean> {
  if (getAccessTokenFn) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const idx = readyWaiters.indexOf(onReady);
      if (idx >= 0) readyWaiters.splice(idx, 1);
      resolve(ok);
    };
    const onReady = () => finish(true);
    const timer = setTimeout(() => finish(!!getAccessTokenFn), timeoutMs);
    readyWaiters.push(onReady);
  });
}

export async function exchangeDriveAuthCode(code: string): Promise<DriveAccessToken> {
  if (!exchangeCodeFn) {
    const ready = await waitForDriveAuthBridge();
    if (!ready || !exchangeCodeFn) {
      throw new Error('Google Drive auth bridge is not ready. Sign in and try again.');
    }
  }
  return exchangeCodeFn(code);
}

export async function getPersistedDriveAccessToken(): Promise<DriveAccessToken | null> {
  if (!getAccessTokenFn) {
    const ready = await waitForDriveAuthBridge();
    if (!ready || !getAccessTokenFn) return null;
  }
  return getAccessTokenFn();
}

export async function disconnectPersistedDrive(): Promise<void> {
  if (!disconnectFn) {
    const ready = await waitForDriveAuthBridge(2_000);
    if (!ready || !disconnectFn) return;
  }
  await disconnectFn();
}
