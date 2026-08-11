export type ProjectType = 'DAILY_LOG' | 'JOB' | 'PERSONAL' | 'CUSTOM';

export interface Project {
  id: string;
  userId: string;
  parentId: string | null;
  areaId: string | null;
  name: string;
  color: string | null;
  type: ProjectType;
  isArchived: boolean;
  calendarSyncEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Area {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  color?: string;
  parentId?: string | null;
  areaId?: string | null;
  type?: ProjectType;
  customColumns?: string[];
  calendarSyncEnabled?: boolean;
}

export interface UpdateProjectRequest {
  name?: string;
  color?: string;
  isArchived?: boolean;
  sortOrder?: number;
  parentId?: string | null;
  areaId?: string | null;
  calendarSyncEnabled?: boolean;
}

export interface ProjectColumn {
  id: string;
  projectId: string;
  name: string;
  color: string;
  isDone: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateProjectColumnRequest {
  name: string;
  color?: string;
  isDone?: boolean;
  sortOrder?: number;
}

export interface UpdateProjectColumnRequest {
  name?: string;
  color?: string;
  isDone?: boolean;
  sortOrder?: number;
}
