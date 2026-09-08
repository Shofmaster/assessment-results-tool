/**
 * Status of the hosted → desktop mirror, for the UI.
 *
 * A module-level store rather than React state so the runner (which lives at
 * the top of the tree) and the Settings page (deep inside it) share one truth
 * without threading props. The last summary is persisted so the Settings page
 * can say "last synced ..." on a launch that has not synced yet.
 */
import { useSyncExternalStore } from 'react';
import type { MirrorProgress, MirrorSummary } from './hostedMirror';

export interface MirrorState {
  /** Whether a mirror can run on this page: hosted account + hosted URL configured. */
  available: boolean;
  running: boolean;
  progress: MirrorProgress | null;
  lastSummary: MirrorSummary | null;
  /** A failure that stopped the run before it produced a summary. */
  lastError: string | null;
}

const STORAGE_KEY = 'aerogap.hostedMirror.lastSummary';

function readPersisted(): MirrorSummary | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MirrorSummary) : null;
  } catch {
    return null;
  }
}

let state: MirrorState = {
  available: false,
  running: false,
  progress: null,
  lastSummary: readPersisted(),
  lastError: null,
};

const listeners = new Set<() => void>();

function set(patch: Partial<MirrorState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const hostedMirrorStore = {
  get: () => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setAvailable: (available: boolean) => set({ available }),
  start: () => set({ running: true, progress: { phase: 'listing', done: 0, total: 0 }, lastError: null }),
  progress: (progress: MirrorProgress) => set({ progress }),
  finish(summary: MirrorSummary): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(summary));
    } catch {
      // Not persisted; the in-memory value still serves this page.
    }
    set({ running: false, progress: null, lastSummary: summary });
  },
  fail: (message: string) => set({ running: false, progress: null, lastError: message }),
  /** Tests only. */
  reset(): void {
    state = { available: false, running: false, progress: null, lastSummary: null, lastError: null };
    for (const listener of listeners) listener();
  },
};

/**
 * Ask the runner for a sync now. Registered by the runner while mounted; a
 * no-op when it is not (local account, hosted URL missing).
 */
let requestRun: (() => void) | null = null;
export function registerMirrorRunner(fn: (() => void) | null): void {
  requestRun = fn;
}
export function requestMirrorRun(): boolean {
  if (!requestRun) return false;
  requestRun();
  return true;
}

export function useHostedMirror(): MirrorState {
  return useSyncExternalStore(hostedMirrorStore.subscribe, hostedMirrorStore.get, hostedMirrorStore.get);
}
