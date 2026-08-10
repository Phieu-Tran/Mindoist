export type TaskPropertyId =
  | 'project'
  | 'tags'
  | 'priority'
  | 'color'
  | 'deadline'
  | 'plannedTime'
  | 'recurrence'
  | 'duration';

export type TaskPropertySectionId = 'organize' | 'schedule' | 'automation';

export interface TaskPropertyDefinition {
  id: TaskPropertyId;
  section: TaskPropertySectionId;
  importance: 'primary' | 'secondary';
  supportsOffline: boolean;
}

export const taskPropertyRegistry: readonly TaskPropertyDefinition[] = [
  { id: 'project', section: 'organize', importance: 'primary', supportsOffline: true },
  { id: 'tags', section: 'organize', importance: 'secondary', supportsOffline: true },
  { id: 'priority', section: 'organize', importance: 'primary', supportsOffline: true },
  { id: 'color', section: 'organize', importance: 'secondary', supportsOffline: true },
  { id: 'deadline', section: 'schedule', importance: 'primary', supportsOffline: true },
  { id: 'plannedTime', section: 'schedule', importance: 'primary', supportsOffline: true },
  { id: 'duration', section: 'schedule', importance: 'secondary', supportsOffline: true },
  { id: 'recurrence', section: 'automation', importance: 'secondary', supportsOffline: true },
] as const;

export function propertiesForSection(section: TaskPropertySectionId) {
  return taskPropertyRegistry.filter(property => property.section === section);
}
