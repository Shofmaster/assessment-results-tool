#!/usr/bin/env node
/**
 * CI dependency audit gate.
 *
 * Wraps `npm audit --json` and fails on any advisory at or above THRESHOLD,
 * except those explicitly allowlisted below. Plain `npm audit --audit-level=high`
 * has no way to accept a reviewed, unfixable advisory, so a single such advisory
 * pins CI red forever and every other high-severity finding gets lost in the noise.
 *
 * Run: `node scripts/check-dependency-audit.mjs`
 */

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const THRESHOLD = 'high';
const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];

/**
 * Advisories we have reviewed and consciously accepted.
 *
 * Every entry needs a reason explaining why it is not exploitable here AND a
 * reviewBy date. Past that date the build fails: an accepted risk has to be
 * re-argued periodically, not inherited silently. To clear an entry, upgrade the
 * dependency and delete it -- do not just push the date out.
 */
const ALLOWLIST = [
  {
    id: 'GHSA-qwww-vcr4-c8h2',
    package: 'react-router',
    title: 'RSC Mode CSRF Bypass Allows Action Execution Before 400 Response',
    reviewBy: '2026-10-31',
    reason: [
      'Affects react-router >=7.12.0 <8.3.0. Only fix is react-router 8.3.0, which',
      'requires react >=19.2.7 and node >=22.22.0 (this app is on react 18.3.1), and',
      'react-router-dom has no 8.x line at all -- so taking it means a React 19 major',
      'migration, not a dependency bump. Downgrading to 7.11.0 (npm audit fix --force)',
      'is strictly worse: it reintroduces 14 advisories including the production-reachable',
      'open redirect / XSS fixed in 7.18.1.',
      'Not reachable here: the vulnerability is in react-router RSC (React Server',
      'Components) mode. This app is a client-rendered Vite SPA on BrowserRouter with no',
      'SSR, no RSC, and no react-router server actions -- there is no server-side action',
      'request for the bypass to act on.',
      'Clear this by upgrading to React 19 + react-router 8.',
    ].join(' '),
  },
];

function severityAtLeast(severity, floor) {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(floor);
}

function advisoryIdFromUrl(url) {
  const match = /(GHSA-[a-z0-9-]+)/i.exec(url || '');
  return match ? match[1] : null;
}

function runAudit() {
  // npm audit exits non-zero whenever vulnerabilities exist, so the exit code is
  // not a failure signal here -- only unparseable output is.
  // Passed as one shell string rather than a command plus args array: the array form
  // needs `npm.cmd` on Windows, and combining it with `shell: true` trips DEP0190.
  const result = spawnSync('npm audit --json', {
    cwd: rootDir,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (!result.stdout) {
    console.error('Could not run `npm audit --json`.');
    if (result.error) console.error(result.error.message);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(1);
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    console.error('Could not parse `npm audit --json` output.');
    console.error(result.stdout.slice(0, 2000));
    process.exit(1);
  }
}

/** Flatten the audit report into one entry per distinct advisory. */
function collectAdvisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
      // A string `via` is just a pointer to another vulnerable package, not an
      // advisory of its own -- the advisory it refers to is collected separately.
      if (typeof via !== 'object') continue;
      const id = advisoryIdFromUrl(via.url);
      if (!id || found.has(id)) continue;
      found.set(id, {
        id,
        package: via.name,
        title: via.title,
        severity: via.severity,
        range: via.range,
        url: via.url,
      });
    }
  }
  return [...found.values()];
}

function main() {
  const advisories = collectAdvisories(runAudit());
  const blocking = advisories.filter((a) => severityAtLeast(a.severity, THRESHOLD));

  const today = new Date().toISOString().slice(0, 10);
  const allowed = [];
  const expired = [];
  const failures = [];

  for (const advisory of blocking) {
    const entry = ALLOWLIST.find((e) => e.id === advisory.id);
    if (!entry) {
      failures.push(advisory);
    } else if (entry.reviewBy < today) {
      expired.push({ advisory, entry });
    } else {
      allowed.push({ advisory, entry });
    }
  }

  for (const { advisory, entry } of allowed) {
    console.log(`ALLOWED  ${advisory.severity.padEnd(8)} ${advisory.id}  ${advisory.package}`);
    console.log(`         ${advisory.title}`);
    console.log(`         accepted until ${entry.reviewBy}`);
    console.log('');
  }

  const stale = ALLOWLIST.filter((e) => !blocking.some((a) => a.id === e.id));
  for (const entry of stale) {
    console.log(
      `NOTE     ${entry.id} (${entry.package}) is allowlisted but no longer reported -- remove it from ${'scripts/check-dependency-audit.mjs'}.`
    );
    console.log('');
  }

  for (const { advisory, entry } of expired) {
    console.error(
      `EXPIRED  ${advisory.severity.padEnd(8)} ${advisory.id}  ${advisory.package}`
    );
    console.error(`         ${advisory.title}`);
    console.error(`         ${advisory.url}`);
    console.error(
      `         Accepted until ${entry.reviewBy}, which has passed. Upgrade the dependency and`
    );
    console.error(
      `         drop the allowlist entry, or re-review the risk and set a new reviewBy date.`
    );
    console.error('');
  }

  for (const advisory of failures) {
    console.error(`FAIL     ${advisory.severity.padEnd(8)} ${advisory.id}  ${advisory.package}`);
    console.error(`         ${advisory.title}`);
    console.error(`         vulnerable: ${advisory.range}`);
    console.error(`         ${advisory.url}`);
    console.error('');
  }

  const blockedCount = failures.length + expired.length;
  if (blockedCount > 0) {
    console.error(
      `Dependency audit failed: ${blockedCount} unaccepted advisory/advisories at ${THRESHOLD}+.`
    );
    console.error('Fix with `npm audit fix`, or add a reviewed entry to ALLOWLIST in this script.');
    process.exit(1);
  }

  console.log(
    `Dependency audit passed: no unaccepted advisories at ${THRESHOLD}+ (${allowed.length} allowlisted).`
  );
}

main();
