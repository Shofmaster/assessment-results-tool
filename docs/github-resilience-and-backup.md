# GitHub Resilience and Backup Runbook

This runbook protects source code and release continuity for `aviationassessment`.

## 1) Required GitHub protections

Apply these settings to the default branch (`main`):

- Require pull requests before merging
- Require at least 1 approving review
- Dismiss stale approvals on new commits
- Require status checks to pass before merging
- Require conversation resolution before merging
- Restrict who can push to matching branches
- Do not allow force pushes
- Do not allow branch deletions

Also enable:

- GitHub 2FA enforcement for organization members
- Least-privilege repository roles (no admin for day-to-day contributors)
- Protected environment for production deployments with required reviewers

## 2) Git mirror backup process

### 2.0 Cloud-first mirror on every `main` change (no personal computer required)

This repo includes workflow:

- `.github/workflows/mirror-backup.yml`

Behavior:

- Runs on every push to `main`
- Also supports manual run via **Actions -> Mirror Backup On Main -> Run workflow**
- Clones this repository as a mirror and pushes all refs (branches/tags) to a backup remote

Required GitHub secrets in this repository:

- `BACKUP_SSH_PRIVATE_KEY`
- `BACKUP_SSH_REPO`

Example `BACKUP_SSH_REPO` value:

- `git@github.com:<owner>/<backup-repo>.git`

Quick SSH setup:

1. Generate a dedicated keypair on your machine:
   - `ssh-keygen -t ed25519 -C "mirror-backup" -f mirror-backup-key`
2. In backup repo (`AeroGap/assessment-results-tool`), go to **Settings -> Deploy keys**.
3. Add a new deploy key:
   - Title: `mirror-backup`
   - Key: paste contents of `mirror-backup-key.pub`
   - Enable **Allow write access**
4. In primary repo, open **Settings -> Secrets and variables -> Actions**.
5. Add secret `BACKUP_SSH_PRIVATE_KEY` with the full private key content from `mirror-backup-key`.
6. Add secret `BACKUP_SSH_REPO` with:
   - `git@github.com:AeroGap/assessment-results-tool.git`
7. Push any commit to `main` (or run the workflow manually once).
8. Confirm success in **Actions** and verify commits appear in backup repo.

Quick setup:

1. Create an empty private backup repository.
2. Create and register SSH deploy key with write access for backup repo.
3. Add `BACKUP_SSH_PRIVATE_KEY` and `BACKUP_SSH_REPO` in **GitHub -> Settings -> Secrets and variables -> Actions**.
4. Push any commit to `main` (or run the workflow manually once).
5. Confirm success in **Actions** and verify commits appear in the backup repo.

### 2.1 Local mirror generation

Run:

```bash
npm run backup:git:mirror
```

Default output:

- `backups/git-mirror/<repo>.git` (mirror repository)
- `backups/git-mirror/metadata/*.manifest.json`
- `backups/git-mirror/metadata/*.refs.txt`

Optional custom output directory:

```bash
GIT_MIRROR_OUT_DIR="D:/Backups/aviation-git" npm run backup:git:mirror
```

### 2.2 Mirror verification (restore drill)

Run:

```bash
npm run backup:git:verify
```

This script:

- runs `git fsck` on the mirror
- clones the mirror into a temporary restore directory
- validates restored `HEAD` matches mirror `HEAD`
- runs `git fsck` on the restored clone

### 2.3 Recommended cadence

- Nightly: `npm run backup:git:run`
- Weekly: review latest manifest and backup logs
- Monthly: perform one manual restore drill and record results

### 2.4 Windows Task Scheduler (recommended for this machine)

1. Open **Task Scheduler** -> **Create Task**.
2. General tab:
   - Name: `AviationAssessment Git Mirror Backup`
   - Select **Run whether user is logged on or not**
   - Select **Run with highest privileges**
3. Triggers tab:
   - New -> Daily -> choose preferred time (example `02:15 AM`)
4. Actions tab:
   - Program/script: `cmd.exe`
   - Add arguments:
     - `/c "C:\Users\shelb\OneDrive\Documents\Aviation Quality Company\aviationassessment\scripts\run-git-backup-nightly.cmd"`
5. Conditions tab:
   - Optional: uncheck *Start the task only if the computer is on AC power* if needed.
6. Settings tab:
   - Enable **Run task as soon as possible after a scheduled start is missed**
   - Enable **If the task fails, restart every** 30 minutes, up to 3 attempts
7. Save and run task once manually to confirm success.

To send mirror output to offsite synced storage, set a system/user environment variable before running the task:

- `GIT_MIRROR_OUT_DIR=<your encrypted/synced directory>`

### 2.5 Offsite storage

Upload `backups/git-mirror/` to encrypted object storage.

Minimum retention:

- daily snapshots: 35 days
- monthly snapshots: 12 months

## 3) Release tagging and rollback

### 3.1 Release tag convention

Use annotated tags for production cutovers:

- `prod-YYYY-MM-DD`
- optional hotfix suffix: `prod-YYYY-MM-DD-hotfix1`

Example:

```bash
git tag -a prod-2026-04-01 -m "Production release 2026-04-01"
git push origin prod-2026-04-01
```

### 3.2 Rollback steps (code)

1. Identify last known good production tag.
2. Validate that Convex production URL and environment variables are unchanged.
3. Checkout the tag in a clean workspace:
   - `git fetch --tags`
   - `git checkout <prod-tag>`
4. Build and run smoke tests.
5. Redeploy from that tag or promote matching deployment.
6. Confirm app health and data connectivity.

### 3.3 Rollback validation checklist

- Login flow works
- Project and roster pages load
- Document library opens and files are accessible
- Core save/update operations succeed
- No new critical errors in deployment logs

## 4) Incident response notes

For any production incident:

1. Freeze direct pushes to `main`.
2. Snapshot current state (git tag + Convex backup marker).
3. Decide rollback vs forward fix in under 30 minutes.
4. Record timeline, root cause, and prevention action.
