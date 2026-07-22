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

export function setDriveAuthBridge(bridge: {
  exchangeCode: ExchangeCodeFn | null;
  getAccessToken: GetAccessTokenFn | null;
  disconnect: DisconnectFn | null;
}): void {
  exchangeCodeFn = bridge.exchangeCode;
  getAccessTokenFn = bridge.getAccessToken;
  disconnectFn = bridge.disconnect;
}

export async function exchangeDriveAuthCode(code: string): Promise<DriveAccessToken> {
  if (!exchangeCodeFn) {
    throw new Error('Google Drive auth bridge is not ready. Sign in and try again.');
  }
  return exchangeCodeFn(code);
}

export async function getPersistedDriveAccessToken(): Promise<DriveAccessToken | null> {
  if (!getAccessTokenFn) return null;
  return getAccessTokenFn();
}

export async function disconnectPersistedDrive(): Promise<void> {
  if (!disconnectFn) return;
  await disconnectFn();
}
