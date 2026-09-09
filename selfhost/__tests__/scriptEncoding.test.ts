import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards a Windows packaging trap that cost real debugging time.
 *
 * Windows PowerShell 5.1 - the version shipped on Server 2016/2019, which is
 * what an on-prem customer will run - reads a .ps1 with no byte-order mark
 * using the system ANSI codepage. A UTF-8 em dash in a comment then decodes to
 * mojibake and the parser fails with "Missing closing '}'" pointing at a line
 * hundreds away from the real problem.
 *
 * So every shipped script must be ASCII-only, or carry a UTF-8 BOM. This test
 * fails the build rather than letting a customer discover it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const windowsDir = join(here, '..', 'windows');

function powershellFiles(): string[] {
  return readdirSync(windowsDir)
    .filter((f) => f.toLowerCase().endsWith('.ps1'))
    .map((f) => join(windowsDir, f));
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function hasUtf8Bom(bytes: Buffer): boolean {
  return bytes.length >= 3 && UTF8_BOM.every((b, i) => bytes[i] === b);
}

function firstNonAscii(bytes: Buffer): { offset: number; byte: number } | null {
  const start = hasUtf8Bom(bytes) ? 3 : 0;
  for (let i = start; i < bytes.length; i++) {
    if (bytes[i] > 0x7f) return { offset: i, byte: bytes[i] };
  }
  return null;
}

describe('shipped PowerShell script encoding', () => {
  const files = powershellFiles();

  it('finds the Windows installer scripts', () => {
    // A rename or move must not silently turn this whole suite into a no-op.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s is ASCII-only or carries a UTF-8 BOM', (file) => {
    const bytes = readFileSync(file);
    const offending = firstNonAscii(bytes);

    if (offending && !hasUtf8Bom(bytes)) {
      const upTo = bytes.subarray(0, offending.offset).toString('utf8');
      const line = upTo.split(/\r?\n/).length;
      throw new Error(
        `${file} has a non-ASCII byte (0x${offending.byte.toString(16)}) at line ~${line} ` +
          'but no UTF-8 BOM. Windows PowerShell 5.1 will misparse it. ' +
          'Either replace the character with ASCII or save the file as UTF-8 with BOM.',
      );
    }

    expect(true).toBe(true);
  });

  it.each(files)('%s contains no stray control characters', (file) => {
    // A scripted edit once wrote a literal BEL (0x07) and CR into install.ps1
    // where "\a" and "\r" were meant, silently turning a documented filesystem
    // path into one that does not exist. The ASCII check above missed it
    // because control bytes are below 0x7f, and the script still parsed - so
    // nothing failed until an operator followed the bad path.
    const bytes = readFileSync(file);
    const allowed = new Set([0x09, 0x0a, 0x0d]); // tab, LF, CR
    const offenders: string[] = [];

    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < 0x20 && !allowed.has(b)) {
        const line = bytes.subarray(0, i).toString('utf8').split(/\r?\n/).length;
        offenders.push(`0x${b.toString(16).padStart(2, '0')} at line ~${line}`);
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `${file} contains control characters: ${offenders.slice(0, 5).join('; ')}. ` +
          'These are almost always the result of an escape sequence being interpreted ' +
          'during a scripted edit (\\a -> BEL, \\r -> CR) rather than written literally.',
      );
    }

    expect(offenders).toEqual([]);
  });

  it.each(files)('%s does not nest a script block inside a string subexpression', (file) => {
    // Also a 5.1-only parse error: "$( ... { ... } ... )" inside a double-quoted
    // string. Build the value into a variable first.
    const text = readFileSync(file, 'utf8');
    const offenders: number[] = [];

    text.split(/\r?\n/).forEach((line, idx) => {
      // Only look inside double-quoted segments.
      for (const segment of line.match(/"[^"]*"/g) ?? []) {
        if (/\$\([^)]*\{/.test(segment)) offenders.push(idx + 1);
      }
    });

    if (offenders.length > 0) {
      throw new Error(
        `${file} nests a script block inside a $() subexpression within a double-quoted string ` +
          `at line(s) ${offenders.join(', ')}. This is a parse error on Windows PowerShell 5.1.`,
      );
    }

    expect(offenders).toEqual([]);
  });
});
