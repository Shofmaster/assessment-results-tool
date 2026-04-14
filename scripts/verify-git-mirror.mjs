#!/usr/bin/env node
/**
 * Validate a git mirror backup by cloning it and checking integrity.
 *
 * Usage:
 *   node scripts/verify-git-mirror.mjs
 *   node scripts/verify-git-mirror.mjs --mirror-dir "D:/Backups/git-mirror"
 *
 * Environment variables:
 *   GIT_MIRROR_OUT_DIR   Absolute/relative backup output directory
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${stderr || stdout || "No output"}`
    );
  }

  return (result.stdout || "").trim();
}

function parseArg(flagName) {
  const idx = process.argv.indexOf(flagName);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function sanitizeRepoName(input) {
  return input.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} does not exist: ${targetPath}`);
  }
}

function main() {
  const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
  const repoName = sanitizeRepoName(path.basename(repoRoot));
  const cliMirrorDir = parseArg("--mirror-dir");
  const mirrorDir = path.resolve(
    cliMirrorDir || process.env.GIT_MIRROR_OUT_DIR || path.join(repoRoot, "backups", "git-mirror")
  );
  const mirrorRepoPath = path.join(mirrorDir, `${repoName}.git`);

  ensureExists(mirrorDir, "Mirror directory");
  ensureExists(mirrorRepoPath, "Mirror repository");

  console.log(`Using mirror: ${mirrorRepoPath}`);

  // Validate mirror object graph before restore test.
  run("git", ["--git-dir", mirrorRepoPath, "fsck", "--full"], { stdio: "inherit" });

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "git-mirror-verify-"));
  const restorePath = path.join(tempBase, repoName);

  try {
    run("git", ["clone", mirrorRepoPath, restorePath], { stdio: "inherit" });

    const restoredHead = run("git", ["-C", restorePath, "rev-parse", "HEAD"]);
    const mirrorHead = run("git", ["--git-dir", mirrorRepoPath, "rev-parse", "HEAD"]);
    if (restoredHead !== mirrorHead) {
      throw new Error(`Head mismatch. restored=${restoredHead} mirror=${mirrorHead}`);
    }

    const restoreFsck = spawnSync("git", ["-C", restorePath, "fsck", "--full"], {
      stdio: "inherit",
    });
    if (restoreFsck.status !== 0) {
      throw new Error("Restored clone fsck failed.");
    }

    console.log("Mirror verification passed.");
    console.log(`Restored HEAD: ${restoredHead}`);
  } finally {
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
