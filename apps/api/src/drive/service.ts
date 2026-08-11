import { google } from 'googleapis';
import { prisma } from '../db.js';

const BACKUP_FOLDER_NAME = 'Mindoist';

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/gcal/callback',
  );
}

async function getAuthForUser(userId: string) {
  const account = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!account?.refreshToken) throw new Error('Google account not connected');

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: account.refreshToken });
  return oauth2;
}

async function findOrCreateBackupFolder(auth: ReturnType<typeof getOAuth2Client>): Promise<string> {
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.list({
    q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (res.data.files && res.data.files.length > 0 && res.data.files[0].id) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  return folder.data.id!;
}

// ---------------------------------------------------------------------------
// Export data from PG → upload to Drive
// ---------------------------------------------------------------------------

interface BackupData {
  schema: number;
  exportedAt: string;
  tasks: unknown[];
  projects: unknown[];
  projectColumns: unknown[];
  sections: unknown[];
  tags: unknown[];
  taskTags: unknown[];
  notes: unknown[];
}

async function exportUserData(userId: string): Promise<BackupData> {
  const [tasks, projects, projectColumns, sections, tags, taskTags, notes] = await Promise.all([
    prisma.task.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.project.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.projectColumn.findMany({
      where: { project: { userId }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.section.findMany({
      where: { project: { userId }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.tag.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.taskTag.findMany({
      where: {
        task: { userId },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.note.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    schema: 1,
    exportedAt: new Date().toISOString(),
    tasks,
    projects,
    projectColumns,
    sections,
    tags,
    taskTags,
    notes,
  };
}

export async function createBackup(userId: string): Promise<{
  fileId: string;
  fileName: string;
  sizeBytes: number;
  exportedAt: string;
}> {
  const auth = await getAuthForUser(userId);
  const folderId = await findOrCreateBackupFolder(auth);
  const drive = google.drive({ version: 'v3', auth });

  const data = await exportUserData(userId);
  const content = JSON.stringify(data, null, 2);
  const sizeBytes = Buffer.byteLength(content, 'utf-8');

  const fileName = `backup-${data.exportedAt.replace(/[:.]/g, '-')}.json`;

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: content,
    },
    fields: 'id',
  });

  return {
    fileId: file.data.id!,
    fileName,
    sizeBytes,
    exportedAt: data.exportedAt,
  };
}

// ---------------------------------------------------------------------------
// List backups
// ---------------------------------------------------------------------------

export interface BackupFile {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export async function listBackups(userId: string): Promise<BackupFile[]> {
  const auth = await getAuthForUser(userId);
  const folderId = await findOrCreateBackupFolder(auth);
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/json' and trashed=false`,
    fields: 'files(id, name, size, createdTime)',
    orderBy: 'createdTime desc',
    spaces: 'drive',
  });

  return (res.data.files || []).map(f => ({
    fileId: f.id!,
    fileName: f.name || '',
    sizeBytes: Number(f.size) || 0,
    createdAt: f.createdTime || '',
  }));
}

// ---------------------------------------------------------------------------
// Download backup
// ---------------------------------------------------------------------------

export async function downloadBackup(userId: string, fileId: string): Promise<BackupData> {
  const auth = await getAuthForUser(userId);
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.get({
    fileId,
    alt: 'media',
  });

  const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  const data = JSON.parse(content) as BackupData;

  if (!data.schema || !data.exportedAt) {
    throw new Error('Invalid backup file format');
  }

  return data;
}

// ---------------------------------------------------------------------------
// Delete backup
// ---------------------------------------------------------------------------

export async function deleteBackup(userId: string, fileId: string): Promise<void> {
  const auth = await getAuthForUser(userId);
  const drive = google.drive({ version: 'v3', auth });

  await drive.files.delete({ fileId });
}

// ---------------------------------------------------------------------------
// Restore from backup → replace all user data in PG
// ---------------------------------------------------------------------------

interface RestoreResult {
  tasks: number;
  projects: number;
  sections: number;
  tags: number;
  notes: number;
}

export async function restoreFromBackup(userId: string, fileId: string): Promise<RestoreResult> {
  const data = await downloadBackup(userId, fileId);

  // Replace all user data in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Delete existing data (in dependency order)
    await tx.note.deleteMany({ where: { userId } });
    await tx.taskTag.deleteMany({ where: { task: { userId } } });
    await tx.reminder.deleteMany({ where: { task: { userId } } });
    await tx.gCalLink.deleteMany({ where: { task: { userId } } });
    await tx.task.deleteMany({ where: { userId } });
    await tx.section.deleteMany({ where: { project: { userId } } });
    await tx.projectColumn.deleteMany({ where: { project: { userId } } });
    await tx.project.deleteMany({ where: { userId } });
    await tx.tag.deleteMany({ where: { userId } });

    // Insert backup data
    const projectIds = new Map<string, string>();
    const taskIds = new Map<string, string>();
    const tagIds = new Map<string, string>();

    // Projects
    for (const p of data.projects as any[]) {
      const oldId = p.id;
      const created = await tx.project.create({
        data: {
          userId,
          name: p.name,
          color: p.color ?? null,
          type: p.type || 'CUSTOM',
          isArchived: p.isArchived ?? false,
          sortOrder: p.sortOrder ?? 0,
        },
      });
      projectIds.set(oldId, created.id);
    }

    // Project columns
    for (const col of data.projectColumns as any[]) {
      const newProjectId = projectIds.get(col.projectId);
      if (!newProjectId) continue;
      await tx.projectColumn.create({
        data: {
          projectId: newProjectId,
          name: col.name,
          color: col.color || 'slate',
          isDone: col.isDone ?? false,
          sortOrder: col.sortOrder ?? 0,
        },
      });
    }

    // Sections
    for (const s of data.sections as any[]) {
      const newProjectId = projectIds.get(s.projectId);
      if (!newProjectId) continue;
      await tx.section.create({
        data: {
          projectId: newProjectId,
          name: s.name,
          sortOrder: s.sortOrder ?? 0,
        },
      });
    }

    // Tags
    for (const t of data.tags as any[]) {
      const created = await tx.tag.create({
        data: {
          userId,
          name: t.name,
          color: t.color ?? null,
        },
      });
      tagIds.set(t.id, created.id);
    }

    // Tasks
    for (const t of data.tasks as any[]) {
      const newProjectId = t.projectId ? projectIds.get(t.projectId) : undefined;
      const created = await tx.task.create({
        data: {
          userId,
          projectId: newProjectId || null,
          title: t.title,
          description: t.description ?? null,
          color: t.color ?? null,
          priority: t.priority ?? null,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          startDate: t.startDate ? new Date(t.startDate) : null,
          dueTime: t.dueTime ?? null,
          durationMin: t.durationMin ?? null,
          rrule: t.rrule ?? null,
          pomodoroCount: t.pomodoroCount ?? 0,
          completedAt: t.completedAt ? new Date(t.completedAt) : null,
          sortOrder: t.sortOrder ?? 0,
        },
      });
      taskIds.set(t.id, created.id);
    }

    // Task tags
    for (const tt of data.taskTags as any[]) {
      const newTaskId = taskIds.get(tt.taskId);
      const newTagId = tagIds.get(tt.tagId);
      if (!newTaskId || !newTagId) continue;
      await tx.taskTag.create({
        data: {
          taskId: newTaskId,
          tagId: newTagId,
        },
      });
    }

    // Notes
    let noteCount = 0;
    for (const n of data.notes as any[]) {
      const newTaskId = n.taskId ? taskIds.get(n.taskId) : undefined;
      await tx.note.create({
        data: {
          userId,
          taskId: newTaskId || null,
          title: n.title ?? null,
          content: n.content ?? null,
        },
      });
      noteCount++;
    }

    return {
      tasks: taskIds.size,
      projects: projectIds.size,
      sections: (data.sections as any[]).filter(s => projectIds.has(s.projectId)).length,
      tags: tagIds.size,
      notes: noteCount,
    };
  });

  return result;
}
