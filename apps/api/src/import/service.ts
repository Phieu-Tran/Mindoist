import { parse } from 'csv-parse/sync';
import { prisma } from '../db.js';

interface TickTickRow {
  'Folder Name': string;
  'List Name': string;
  'Title': string;
  'Tags': string;
  'Content': string;
  'Is Check list': string;
  'Start Date': string;
  'Due Date': string;
  'Reminder': string;
  'Repeat': string;
  'Priority': string;
  'Status': string;
  'Created Time': string;
  'Completed Time': string;
  'Order': string;
  'Timezone': string;
  'Is All Day': string;
  'Is Floating': string;
  'Column Name': string;
  'Column Order': string;
  'View Mode': string;
  'taskId': string;
  'parentId': string;
}

export interface ParsedTask {
  title: string;
  content: string;
  isChecklist: boolean;
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  // Canonical deadline fields; dueDate/dueTime remain in the preview for
  // backwards-compatible import clients and CSV review tooling.
  deadlineDate?: string | null;
  deadlineTime?: string | null;
  deadlineTimeZone?: string | null;
  rrule: string | null;
  priority: number | null;
  isCompleted: boolean;
  completedAt: string | null;
  listName: string;
  columnName: string | null;
  tags: string[];
  tickTickTaskId: string;
  tickTickParentId: string;
  checklistItems: string[];
}

export interface ImportPreview {
  tasks: ParsedTask[];
  projects: string[];
  tags: string[];
  stats: {
    total: number;
    completed: number;
    recurring: number;
    checklists: number;
    withDueDate: number;
  };
}

// TickTick priority scale: 0=None, 1=Low, 3=Medium, 5=High.
// Mindoist: 1=highest ... 4=lowest, null=no priority — 0 must map to null,
// not P4, or every un-prioritized TickTick task (the vast majority in
// practice) would import as an explicit "lowest priority" instead of "none".
function mapPriority(ticktickPriority: string): number | null {
  const val = parseInt(ticktickPriority.replace(/^p/i, ''), 10);
  if (val === 5) return 1;
  if (val === 3) return 2;
  if (val === 1) return 3;
  return null;
}

function parseDateTime(iso: string): { date: string; time: string } | null {
  if (!iso?.trim()) return null;
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}/);
  if (!match) return null;
  return { date: match[1], time: match[2] };
}

function parseChecklist(content: string): string[] {
  const normalized = content.replace(/\r\n|\r|\n/g, '\n');
  const lines = normalized.split('\n').filter(Boolean);
  return lines
    .filter((l) => l.startsWith('\u25ab') || l.startsWith('\u25aa'))
    .map((l) => l.replace(/^[▪▫]\s*/, ''));
}

function dedupTasks(rows: ParsedTask[]): ParsedTask[] {
  const seen = new Map<string, ParsedTask>();
  for (const row of rows) {
    const key = row.tickTickTaskId;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
    } else if (row.isCompleted && !existing.isCompleted) {
      seen.set(key, row);
    } else if (!row.isCompleted && existing.isCompleted) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}

export function parseTickTickCsv(csvContent: string): ImportPreview {
  // TickTick's export prepends "Date: ...", "Version: ...", "Status: ..." lines
  // before the real header row — skip them so `columns: true` doesn't pick up
  // the wrong header.
  const headerIndex = csvContent.indexOf('"Folder Name"');
  const csvBody = headerIndex >= 0 ? csvContent.slice(headerIndex) : csvContent;

  const records: TickTickRow[] = parse(csvBody, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  const projects = new Set<string>();
  const tags = new Set<string>();
  let completed = 0;
  let recurring = 0;
  let checklists = 0;
  let withDueDate = 0;

  const tasks: ParsedTask[] = records.map((row) => {
    const listName = row['List Name'] || 'Inbox';
    projects.add(listName);

    const tagList = row.Tags
      ? row.Tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    tagList.forEach((t) => tags.add(t));

    const dueDt = parseDateTime(row['Due Date']);
    const isCompleted = row.Status === '1' || row.Status === '2';
    const isRecurring = !!row.Repeat?.trim();
    const isChecklist = row['Is Check list'] === 'Y';

    if (isCompleted) completed++;
    if (isRecurring) recurring++;
    if (isChecklist) checklists++;
    if (dueDt) withDueDate++;

    return {
      title: row.Title?.trim() || 'Untitled',
      content: row.Content?.trim() || '',
      isChecklist,
      startDate: parseDateTime(row['Start Date'])?.date ?? null,
      dueDate: dueDt?.date ?? null,
      dueTime: dueDt?.time ?? null,
      deadlineDate: dueDt?.date ?? null,
      deadlineTime: dueDt?.time ?? null,
      deadlineTimeZone: dueDt?.time ? row.Timezone?.trim() || null : null,
      rrule: row.Repeat?.trim() || null,
      priority: mapPriority(row.Priority || '0'),
      isCompleted,
      completedAt: row['Completed Time']?.trim() || null,
      listName,
      columnName: row['Column Name']?.trim() || null,
      tags: tagList,
      tickTickTaskId: row.taskId || '',
      tickTickParentId: row.parentId || '',
      checklistItems: isChecklist ? parseChecklist(row.Content || '') : [],
    };
  });

  const deduped = dedupTasks(tasks);

  return {
    tasks: deduped,
    projects: Array.from(projects).sort(),
    tags: Array.from(tags).sort(),
    stats: {
      total: deduped.length,
      completed,
      recurring,
      checklists,
      withDueDate,
    },
  };
}

interface ImportResult {
  imported: number;
  projectsCreated: number;
  tagsCreated: number;
}

export async function importTickTickData(
  userId: string,
  preview: ImportPreview,
  dryRun = true,
): Promise<ImportResult> {
  if (dryRun) {
    return {
      imported: preview.tasks.length,
      projectsCreated: preview.projects.length,
      tagsCreated: preview.tags.length,
    };
  }

  // Everything below runs in one transaction: a partial failure (e.g. a bad
  // date on task #200 of 295) must not leave orphaned projects/tags/tasks
  // behind — either the whole import lands, or none of it does.
  return prisma.$transaction(async (tx) => {
    const existingProjects = await tx.project.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const projectMap = new Map(existingProjects.map((p) => [p.name, p.id]));

    let projectsCreated = 0;
    for (const name of preview.projects) {
      if (!projectMap.has(name)) {
        const project = await tx.project.create({
          data: { userId, name },
        });
        projectMap.set(name, project.id);
        projectsCreated++;
      }
    }

    const existingTags = await tx.tag.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const tagMap = new Map(existingTags.map((t) => [t.name, t.id]));

    let tagsCreated = 0;
    for (const name of preview.tags) {
      if (!tagMap.has(name)) {
        const tag = await tx.tag.create({
          data: { userId, name },
        });
        tagMap.set(name, tag.id);
        tagsCreated++;
      }
    }

    // TickTick's Kanban "Column Name" (Backlog / Job / Daily job / ...) has no
    // equivalent unless we create matching ProjectColumn rows ourselves —
    // otherwise every task lands with projectColumnId=null and the board's
    // fallback dumps everything into whichever column renders first.
    const columnsByProject = new Map<string, Map<string, string>>();
    const nextSortOrder = new Map<string, number>();

    async function getOrCreateColumnId(projectId: string, columnName: string): Promise<string> {
      let columns = columnsByProject.get(projectId);
      if (!columns) {
        const existing = await tx.projectColumn.findMany({
          where: { projectId, deletedAt: null },
          select: { id: true, name: true },
        });
        columns = new Map(existing.map((c) => [c.name, c.id]));
        columnsByProject.set(projectId, columns);
        nextSortOrder.set(projectId, existing.length);
      }
      const existingId = columns.get(columnName);
      if (existingId) return existingId;

      const sortOrder = nextSortOrder.get(projectId) ?? 0;
      const created = await tx.projectColumn.create({
        data: { projectId, name: columnName, sortOrder },
      });
      columns.set(columnName, created.id);
      nextSortOrder.set(projectId, sortOrder + 1);
      return created.id;
    }

    const tidToMindId = new Map<string, string>();
    let imported = 0;

    for (const task of preview.tasks) {
      const projectId = projectMap.get(task.listName) ?? null;
      const projectColumnId = projectId && task.columnName
        ? await getOrCreateColumnId(projectId, task.columnName)
        : null;
      const tagIds = task.tags
        .map((t) => tagMap.get(t))
        .filter((id): id is string => !!id);

      // B2.8: checklist items stored as TaskChecklistItem records, not in description
      const description = task.isChecklist ? null : (task.content || null);
      // Import previews created by older clients only contain dueDate/dueTime.
      // Keep that boundary compatible while persisting the canonical deadline
      // columns exclusively.
      const deadlineDate = task.deadlineDate ?? task.dueDate;
      const deadlineTime = task.deadlineTime ?? task.dueTime;

      const taskData = {
        userId,
        title: task.title,
        description,
        priority: task.priority,
        // TickTick's due moment is a deadline, not a planned block.
        deadlineDate: deadlineDate ? new Date(deadlineDate) : null,
        deadlineTime,
        deadlineTimeZone: task.deadlineTimeZone ?? null,
        startDate: task.startDate ? new Date(task.startDate) : null,
        rrule: task.rrule,
        projectId,
        projectColumnId,
        completedAt: task.isCompleted ? new Date(task.completedAt ?? new Date().toISOString()) : null,
        importSource: 'ticktick',
        externalId: task.tickTickTaskId || null,
      };

      // Upsert: if a task with same (userId, importSource, externalId) exists, update it
      let createdId: string;
      if (task.tickTickTaskId) {
        const existing = await tx.task.findFirst({
          where: { userId, importSource: 'ticktick', externalId: task.tickTickTaskId },
          select: { id: true },
        });
        if (existing) {
          await tx.task.update({ where: { id: existing.id }, data: taskData });
          createdId = existing.id;
        } else {
          const row = await tx.task.create({ data: taskData });
          createdId = row.id;
        }
      } else {
        const row = await tx.task.create({ data: taskData });
        createdId = row.id;
      }

      // Attach tags (skip if upserted — tags already exist)
      if (tagIds.length > 0) {
        for (const tagId of tagIds) {
          await tx.taskTag.upsert({
            where: { taskId_tagId: { taskId: createdId, tagId } },
            update: {},
            create: { taskId: createdId, tagId },
          });
        }
      }

      // Create checklist items (for TickTick checklist tasks)
      if (task.isChecklist && task.checklistItems.length > 0) {
        // Delete existing checklist items on re-import to avoid duplicates
        await tx.taskChecklistItem.deleteMany({ where: { taskId: createdId } });
        for (let i = 0; i < task.checklistItems.length; i++) {
          await tx.taskChecklistItem.create({
            data: {
              taskId: createdId,
              title: task.checklistItems[i],
              sortOrder: i + 1,
            },
          });
        }
      }

      tidToMindId.set(task.tickTickTaskId, createdId);
      imported++;
    }

    for (const task of preview.tasks) {
      if (task.tickTickParentId && task.tickTickParentId !== '0') {
        const parentId = tidToMindId.get(task.tickTickParentId);
        const childId = tidToMindId.get(task.tickTickTaskId);
        if (parentId && childId) {
          await tx.task.update({
            where: { id: childId },
            data: { parentId },
          });
        }
      }
    }

    return { imported, projectsCreated, tagsCreated };
  }, { timeout: 60_000 });
}
