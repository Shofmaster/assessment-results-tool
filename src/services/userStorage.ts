import type { Project } from '../types/project';
import type { UserProfile, PersistedSession, UserRegistry } from '../types/userSession';

// --- Hashing ---

export async function hashEmail(email: string): Promise<string> {
  const encoded = new TextEncoder().encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// --- Scoped keys ---

function scopedKey(userHash: string, key: string): string {
  return `aviation-${userHash}-${key}`;
}

// --- Projects ---

export function loadUserProjects(userHash: string): { projects: Project[]; activeProjectId: string | null } {
  try {
    const raw = localStorage.getItem(scopedKey(userHash, 'projects'));
    const activeId = localStorage.getItem(scopedKey(userHash, 'active-project')) || null;
    if (raw) {
      const projects = JSON.parse(raw) as Project[];
      return { projects, activeProjectId: activeId };
    }
  } catch {
    // Corrupt data — start fresh
  }
  return { projects: [], activeProjectId: null };
}

export function saveUserProjects(userHash: string, projects: Project[], activeProjectId: string | null): void {
  try {
    localStorage.setItem(scopedKey(userHash, 'projects'), JSON.stringify(projects));
    localStorage.setItem(scopedKey(userHash, 'active-project'), activeProjectId || '');
  } catch {
    // localStorage full or unavailable
  }
}

// --- User settings (API keys) ---

export function loadUserSettings(userHash: string): {
  googleClientId: string;
  googleApiKey: string;
  thinkingEnabled: boolean;
  thinkingBudget: number;
  selfReviewMode: string;
  selfReviewMaxIterations: number;
} {
  return {
    googleClientId: localStorage.getItem(scopedKey(userHash, 'google-client-id')) || '',
    googleApiKey: localStorage.getItem(scopedKey(userHash, 'google-api-key')) || '',
    thinkingEnabled: localStorage.getItem(scopedKey(userHash, 'thinking-enabled')) === 'true',
    thinkingBudget: Number(localStorage.getItem(scopedKey(userHash, 'thinking-budget'))) || 10000,
    selfReviewMode: localStorage.getItem(scopedKey(userHash, 'self-review-mode')) || 'off',
    selfReviewMaxIterations: Number(localStorage.getItem(scopedKey(userHash, 'self-review-max-iterations'))) || 2,
  };
}

export function saveUserSetting(userHash: string, key: string, value: string): void {
  try {
    localStorage.setItem(scopedKey(userHash, key), value);
  } catch {
    // localStorage full or unavailable
  }
}

// --- Global Google config (pre-login) ---

export function loadGlobalGoogleConfig(): { clientId: string; apiKey: string } {
  try {
    const raw = localStorage.getItem('aviation-google-config');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { clientId: '', apiKey: '' };
}

export function saveGlobalGoogleConfig(clientId: string, apiKey: string): void {
  try {
    localStorage.setItem('aviation-google-config', JSON.stringify({ clientId, apiKey }));
  } catch { /* ignore */ }
}

// --- Session persistence ---

export function persistSession(userProfile: UserProfile): void {
  const session: PersistedSession = {
    userProfile,
    lastSignInAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem('aviation-current-session', JSON.stringify(session));
  } catch { /* ignore */ }
}

export function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem('aviation-current-session');
    if (raw) return JSON.parse(raw) as PersistedSession;
  } catch { /* ignore */ }
  return null;
}

export function clearPersistedSession(): void {
  localStorage.removeItem('aviation-current-session');
}

// --- User registry ---

export function loadUserRegistry(): UserRegistry {
  try {
    const raw = localStorage.getItem('aviation-user-registry');
    if (raw) return JSON.parse(raw) as UserRegistry;
  } catch { /* ignore */ }
  return { users: [], lastActiveUserHash: null };
}

export function saveUserRegistry(registry: UserRegistry): void {
  try {
    localStorage.setItem('aviation-user-registry', JSON.stringify(registry));
  } catch { /* ignore */ }
}

export function addUserToRegistry(profile: UserProfile): void {
  const registry = loadUserRegistry();
  const idx = registry.users.findIndex(u => u.userHash === profile.userHash);
  const entry = {
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    userHash: profile.userHash,
    lastSignInAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    registry.users[idx] = entry;
  } else {
    registry.users.push(entry);
  }
  registry.lastActiveUserHash = profile.userHash;
  saveUserRegistry(registry);
}

// --- Migration from old unscoped keys ---

export function migrateUnscopedData(userHash: string): boolean {
  const oldProjects = localStorage.getItem('aviation-projects');
  if (!oldProjects) return false;

  // Only migrate if user doesn't already have scoped data
  const existing = localStorage.getItem(scopedKey(userHash, 'projects'));
  if (existing) {
    // User already has data — just clean up old keys
    cleanupOldKeys();
    return false;
  }

  try {
    // Copy old data to scoped keys
    localStorage.setItem(scopedKey(userHash, 'projects'), oldProjects);

    const oldActiveProject = localStorage.getItem('aviation-active-project');
    if (oldActiveProject) {
      localStorage.setItem(scopedKey(userHash, 'active-project'), oldActiveProject);
    }

    const oldGClientId = localStorage.getItem('google-client-id');
    if (oldGClientId) {
      localStorage.setItem(scopedKey(userHash, 'google-client-id'), oldGClientId);
    }

    const oldGApiKey = localStorage.getItem('google-api-key');
    if (oldGApiKey) {
      localStorage.setItem(scopedKey(userHash, 'google-api-key'), oldGApiKey);
    }

    cleanupOldKeys();
    return true;
  } catch {
    return false;
  }
}

function cleanupOldKeys(): void {
  localStorage.removeItem('aviation-projects');
  localStorage.removeItem('aviation-active-project');
  localStorage.removeItem('google-client-id');
  localStorage.removeItem('google-api-key');
}
