export interface UserProfile {
  email: string;
  name: string | null;
  picture: string | null;
  userHash: string; // first 16 hex chars of SHA-256(email.toLowerCase())
}

export interface PersistedSession {
  userProfile: UserProfile;
  lastSignInAt: string; // ISO timestamp
}

export interface UserRegistryEntry {
  email: string;
  name: string | null;
  picture: string | null;
  userHash: string;
  lastSignInAt: string;
}

export interface UserRegistry {
  users: UserRegistryEntry[];
  lastActiveUserHash: string | null;
}
