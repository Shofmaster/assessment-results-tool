# Backup and Data Retention

## For operators (Convex backend)

- **Source of truth:** All application data (projects, assessments, documents, analyses, simulations, file metadata) is stored in Convex. Convex provides durability and automatic backups.
- **Backup and restore:** Use the [Convex dashboard](https://dashboard.convex.dev) (or Convex API) to configure backup retention and perform restores. Document internally:
  - **Who can restore:** e.g. which team roles have Convex dashboard access and are allowed to run a restore.
  - **Retention period:** How long backups are kept (per your Convex plan and internal policy).
  - **How to restore:** Follow Convex docs for your deployment (point-in-time restore, etc.).
- **Disaster recovery:** Relying on Convex backups is sufficient for recovering from accidental deletes or data corruption. Optionally, add a scheduled job that exports projects to external storage (e.g. S3) if you have compliance or extra-retention requirements.

## For users (project data)

- **Export as backup:** Users should periodically export important projects to keep a local backup. In the app: **Projects** → select a project → use the **Export** (download) button to save a `.aqp.json` file.
- **What export includes:** The export contains project metadata, assessments, document metadata and extracted text, analyses, simulation results, revision tracking, and agent document metadata. It does **not** include the raw file blobs (original PDF/DOCX bytes). If you need full copies of uploaded files, keep the originals separately.
- **Recommendation:** Export key projects after major updates or on a regular schedule (e.g. monthly) and store the `.aqp.json` files in a safe location.
