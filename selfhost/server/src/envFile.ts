/**
 * Loads configuration from an .env file when the process was not given its
 * environment directly.
 *
 * WHY THIS EXISTS
 * The container gets its environment from compose. A Windows Service does not:
 * WinSW passes environment through its XML, which lives in Program Files and is
 * readable by every local user. Putting ANTHROPIC_API_KEY or CLERK_SECRET_KEY
 * there would expose them to any account on the box.
 *
 * Instead the service points AEROGAP_ENV_FILE at a config file under
 * ProgramData that the installer ACLs to Administrators + SYSTEM, and the
 * process reads it at startup.
 *
 * Real environment variables always win, so compose and shell invocations are
 * unaffected and this is a no-op when AEROGAP_ENV_FILE is unset.
 */
import { readFileSync, existsSync } from 'node:fs';

export interface EnvFileResult {
  loaded: boolean;
  path?: string;
  /** Count only — never the names, which would hint at what is configured. */
  applied: number;
}

/** Parse .env text. Mirrors the subset scripts/doctor.mjs accepts. */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;

    let value = trimmed.slice(eq + 1).trim();
    // Strip matched surrounding quotes. Operators add them by habit, and a
    // literal quote inside a secret produces a baffling auth failure later.
    if (
      value.length > 1 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnvFile(): EnvFileResult {
  const path = (process.env.AEROGAP_ENV_FILE || '').trim();
  if (!path) return { loaded: false, applied: 0 };

  if (!existsSync(path)) {
    // Fail loudly. The service was explicitly told where its configuration is;
    // continuing without it would surface as a confusing "missing APP_ORIGIN"
    // rather than the real problem, which is a wrong or deleted path.
    throw new Error(
      `AEROGAP_ENV_FILE points at "${path}", which does not exist. ` +
        'Check the path in the service definition, or restore the configuration file.',
    );
  }

  let parsed: Record<string, string>;
  try {
    parsed = parseEnvFile(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(
      `Could not read AEROGAP_ENV_FILE at "${path}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let applied = 0;
  for (const [key, value] of Object.entries(parsed)) {
    // A real environment variable is a deliberate override — never clobber it.
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
    applied += 1;
  }

  return { loaded: true, path, applied };
}
