/** Aircraft type (make/model family) within a project. */
export interface AircraftType {
  _id: string;
  projectId: string;
  userId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  variant?: string;
  notes?: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}
