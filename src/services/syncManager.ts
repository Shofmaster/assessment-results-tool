import type { Project } from '../types/project';
import { GoogleDriveService } from './googleDrive';

export interface SyncResult {
  mergedProjects: Project[];
  newFromDrive: number;
  updatedFromDrive: number;
  uploadedToDrive: number;
}

export class SyncManager {
  private driveService: GoogleDriveService;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private syncInProgress = false;
  private onSyncUpdate: ((projects: Project[]) => void) | null = null;

  constructor(driveService: GoogleDriveService) {
    this.driveService = driveService;
  }

  setOnSyncUpdate(callback: (projects: Project[]) => void): void {
    this.onSyncUpdate = callback;
  }

  async initialSync(localProjects: Project[]): Promise<SyncResult> {
    const result: SyncResult = {
      mergedProjects: [],
      newFromDrive: 0,
      updatedFromDrive: 0,
      uploadedToDrive: 0,
    };

    try {
      // Step 1: Load all Drive projects — Drive is authoritative
      const driveFiles = await this.driveService.listProjectFiles();
      const driveProjectIds = new Set<string>();
      const driveFileIds = new Set<string>();

      for (const driveFile of driveFiles) {
        try {
          const driveProject = await this.driveService.loadProjectFile(driveFile.id);
          driveProject.driveFileId = driveFile.id;
          driveProject.lastSyncedAt = new Date().toISOString();
          result.mergedProjects.push(driveProject);
          driveProjectIds.add(driveProject.id);
          driveFileIds.add(driveFile.id);
          result.newFromDrive++;
        } catch {
          // Skip individual file errors
        }
      }

      // Step 2: Find local-only projects and upload them to Drive
      for (const localProject of localProjects) {
        if (driveProjectIds.has(localProject.id)) continue;
        if (localProject.driveFileId && driveFileIds.has(localProject.driveFileId)) continue;

        // Local-only project — upload to Drive
        try {
          const projectToUpload = { ...localProject, driveFileId: undefined };
          const driveFileId = await this.driveService.saveProjectFile(projectToUpload);
          result.mergedProjects.push({
            ...projectToUpload,
            driveFileId,
            lastSyncedAt: new Date().toISOString(),
          });
          result.uploadedToDrive++;
        } catch {
          // Upload failed — still include locally so data isn't lost
          result.mergedProjects.push(localProject);
        }
      }
    } catch {
      // Drive completely unavailable — fall back to local data
      result.mergedProjects = [...localProjects];
    }

    return result;
  }

  scheduleSync(projects: Project[]): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.performSync(projects), 30000);
  }

  private async performSync(projects: Project[]): Promise<void> {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      const updatedProjects = [...projects];
      let changed = false;

      for (let i = 0; i < updatedProjects.length; i++) {
        const project = updatedProjects[i];
        try {
          const driveFileId = await this.driveService.saveProjectFile(project);
          if (driveFileId !== project.driveFileId) {
            updatedProjects[i] = {
              ...project,
              driveFileId,
              lastSyncedAt: new Date().toISOString(),
            };
            changed = true;
          } else {
            updatedProjects[i] = {
              ...project,
              lastSyncedAt: new Date().toISOString(),
            };
            changed = true;
          }
        } catch {
          // Skip individual project errors
        }
      }

      if (changed && this.onSyncUpdate) {
        this.onSyncUpdate(updatedProjects);
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  isSyncing(): boolean {
    return this.syncInProgress;
  }
}
