#!/usr/bin/env node
/**
 * Create or update a local git mirror backup plus metadata manifest.
 *
 * Usage:
 *   node scripts/backup-git-mirror.mjs
 *   node scripts/backup-git-mirror.mjs --out-dir "D:/Backups/git-mirror"
 *
 * Environment variables:
 *   GIT_MIRROR_OUT_DIR   Absolute/relative output directory
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
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

function timestampUtc() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeReadRemoteUrl(repoRoot) {
  try {
    return run("git", ["-C", repoRoot, "remote", "get-url", "origin"]);
  } catch {
    return null;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function main() {
  const cliOutDir = parseArg("--out-dir");
  const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
  const repoName = sanitizeRepoName(path.basename(repoRoot));
  const outDir = path.resolve(
    cliOutDir || process.env.GIT_MIRROR_OUT_DIR || path.join(repoRoot, "backups", "git-mirror")
  );
  const mirrorRepoPath = path.join(outDir, `${repoName}.git`);
  const metadataDir = path.join(outDir, "metadata");
  const now = new Date().toISOString();
  const stamp = timestampUtc();

  ensureDir(outDir);
  ensureDir(metadataDir);

  if (!fs.existsSync(mirrorRepoPath)) {
    console.log("Creating git mirror backup...");
    run("git", ["clone", "--mirror", repoRoot, mirrorRepoPath], { stdio: "inherit" });
  } else {
    console.log("Updating existing git mirror backup...");
    run("git", ["--git-dir", mirrorRepoPath, "remote", "update", "--prune"], { stdio: "inherit" });
  }

  // Run fsck to catch corruption as soon as possible.
  run("git", ["--git-dir", mirrorRepoPath, "fsck", "--full"], { stdio: "inherit" });

  const headCommit = run("git", ["--git-dir", mirrorRepoPath, "rev-parse", "HEAD"]);
  const refsRaw = run("git", ["--git-dir", mirrorRepoPath, "show-ref"]);
  const refs = refsRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, refName] = line.trim().split(/\s+/);
      return { sha, refName };
    });

  const refsSnapshotPath = path.join(metadataDir, `${repoName}-${stamp}.refs.txt`);
  fs.writeFileSync(refsSnapshotPath, refsRaw ? `${refsRaw}\n` : "", "utf8");

  const manifest = {
    repoName,
    repoRoot,
    originRemoteUrl: safeReadRemoteUrl(repoRoot),
    mirrorRepoPath,
    createdAtUtc: now,
    host: os.hostname(),
    headCommit,
    refsCount: refs.length,
    refsFile: refsSnapshotPath,
    refsFileSha256: sha256File(refsSnapshotPath),
  };

  const manifestPath = path.join(metadataDir, `${repoName}-${stamp}.manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Mirror backup complete.");
  console.log(`Mirror repo:   ${mirrorRepoPath}`);
  console.log(`Manifest:      ${manifestPath}`);
  console.log(`Refs snapshot: ${refsSnapshotPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
