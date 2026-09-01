import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards a failure mode that cost a whole install cycle to diagnose.
 *
 * An XML comment may not contain '--' anywhere. Documenting a command-line flag
 * by name inside a comment ("the --convex-origin value...") therefore produces
 * a malformed file. WinSW crashes while parsing it BEFORE it can write to its
 * own log, so the only visible symptom is the Service Control Manager reporting
 * "The service did not respond to the start or control request in a timely
 * fashion" - which points at timeouts, permissions and dependencies, none of
 * which are the cause.
 *
 * install.ps1 substitutes tokens and writes these files verbatim, so a template
 * that is invalid XML produces a service that cannot start.
 */
const here = dirname(fileURLToPath(import.meta.url));
const servicesDir = join(here, '..', 'windows', 'services');

function serviceTemplates(): string[] {
  return readdirSync(servicesDir)
    .filter((f) => f.toLowerCase().endsWith('.xml'))
    .map((f) => join(servicesDir, f));
}

/** Replace {{TOKENS}} with plausible values so the result is parseable. */
function substitute(xml: string): string {
  return xml.replace(/\{\{[A-Z_]+\}\}/g, 'PLACEHOLDER');
}

describe('WinSW service templates', () => {
  const files = serviceTemplates();

  it('finds the service templates', () => {
    // A rename must not turn this suite into a silent no-op.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s has no "--" inside an XML comment', (file) => {
    const xml = readFileSync(file, 'utf8');
    const offenders: string[] = [];

    for (const match of xml.matchAll(/<!--([\s\S]*?)-->/g)) {
      const body = match[1];
      if (body.includes('--')) {
        const upTo = xml.slice(0, match.index ?? 0);
        const line = upTo.split(/\r?\n/).length;
        offenders.push(`line ~${line}`);
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `${file} has "--" inside an XML comment at ${offenders.join(', ')}. ` +
          'This makes the file malformed and WinSW fails to start with only an opaque ' +
          'SCM timeout. Refer to flags without their leading dashes in comments.',
      );
    }

    expect(offenders).toEqual([]);
  });

  it.each(files)('%s parses as XML once tokens are substituted', (file) => {
    const xml = substitute(readFileSync(file, 'utf8'));

    // No XML parser dependency here on purpose: this suite must not acquire one
    // just to catch structural breakage. These checks cover what has actually
    // gone wrong - unbalanced tags and illegal comments.
    const openTags = [...xml.matchAll(/<([a-zA-Z][\w-]*)(\s[^>]*?)?(?<!\/)>/g)].map((m) => m[1]);
    const closeTags = [...xml.matchAll(/<\/([a-zA-Z][\w-]*)>/g)].map((m) => m[1]);

    const counts = new Map<string, number>();
    for (const t of openTags) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of closeTags) counts.set(t, (counts.get(t) ?? 0) - 1);

    const unbalanced = [...counts.entries()].filter(([, n]) => n !== 0);
    expect(unbalanced, `unbalanced tags in ${file}`).toEqual([]);
  });

  it.each(files)('%s declares a service id and executable', (file) => {
    const xml = readFileSync(file, 'utf8');
    expect(xml, `${file} is missing <id>`).toMatch(/<id>\s*\S+\s*<\/id>/);
    expect(xml, `${file} is missing <executable>`).toMatch(/<executable>\s*\S+\s*<\/executable>/);
  });
});
