import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseTickTickCsv, importTickTickData } from './service.js';
import { prisma } from '../db.js';
import { createTestUser, cleanupUsers } from '../test-helpers.js';

const SAMPLE_CSV = `"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"
"","Inbox","Buy milk","food","Get 2% milk","N","","2026-07-20T10:00:00+0000","","","3","0","2026-07-18T08:00:00+0000","","-2748779069440","UTC","true","false",,,"list","1",""
"","Inbox","Morning routine","daily","▫ Exercise\n▪ Meditate","Y","","2026-07-20T07:00:00+0000","","FREQ=DAILY;INTERVAL=1","0","0","2026-07-18T08:00:00+0000","","-1099511627776","UTC","true","false",,,"list","2",""
"","Work","Write report","urgent,work","","N","","2026-07-22T14:00:00+0000","","","5","1","2026-07-15T09:00:00+0000","2026-07-19T16:30:00+0000","-2199023255552","UTC","true","false",,,"list","3",""
"","Inbox","Old task","","","N","","","","","0","2","2026-07-01T08:00:00+0000","2026-07-10T12:00:00+0000","-5000","UTC","true","false",,,"list","4",""
"","Work","Subtask","","Parent is task 3","N","","","","","0","0","2026-07-18T08:00:00+0000","","-4000","UTC","true","false",,,"list","5","3"
`;

describe('TickTick CSV Parser', () => {
  it('parses all rows', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    expect(result.tasks.length).toBe(5);
  });

  it('detects projects', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    expect(result.projects).toContain('Inbox');
    expect(result.projects).toContain('Work');
    expect(result.projects.length).toBe(2);
  });

  it('detects tags', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    expect(result.tags).toContain('food');
    expect(result.tags).toContain('daily');
    expect(result.tags).toContain('urgent');
    expect(result.tags).toContain('work');
  });

  it('maps priorities correctly', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    const milk = result.tasks.find((t) => t.title === 'Buy milk');
    expect(milk?.priority).toBe(2);
    const report = result.tasks.find((t) => t.title === 'Write report');
    expect(report?.priority).toBe(1);
    // TickTick priority "0" means "no priority" — must map to null, not P4
    // (P4 is a real, explicit lowest-priority value in Mindoist).
    const routine = result.tasks.find((t) => t.title === 'Morning routine');
    expect(routine?.priority).toBeNull();
  });

  it('parses due dates and times', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    const milk = result.tasks.find((t) => t.title === 'Buy milk');
    expect(milk?.dueDate).toBe('2026-07-20');
    expect(milk?.dueTime).toBe('10:00');
  });

  it('detects completed tasks', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    const report = result.tasks.find((t) => t.title === 'Write report');
    expect(report?.isCompleted).toBe(true);
    expect(report?.completedAt).toBeTruthy();
    const archived = result.tasks.find((t) => t.title === 'Old task');
    expect(archived?.isCompleted).toBe(true);
  });

  it('detects recurring tasks', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    const routine = result.tasks.find((t) => t.title === 'Morning routine');
    expect(routine?.rrule).toBe('FREQ=DAILY;INTERVAL=1');
  });

  it('parses checklists', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    const routine = result.tasks.find((t) => t.title === 'Morning routine');
    expect(routine?.isChecklist).toBe(true);
    expect(routine?.checklistItems).toContain('Exercise');
    expect(routine?.checklistItems).toContain('Meditate');
  });

  it('computes stats', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    expect(result.stats.total).toBe(5);
    expect(result.stats.completed).toBe(2);
    expect(result.stats.recurring).toBe(1);
    expect(result.stats.checklists).toBe(1);
    expect(result.stats.withDueDate).toBe(3);
  });

  it('parses parent-child relationships', () => {
    const result = parseTickTickCsv(SAMPLE_CSV);
    const subtask = result.tasks.find((t) => t.title === 'Subtask');
    expect(subtask?.tickTickParentId).toBe('3');
  });
});

describe('TickTick CSV Parser — edge cases', () => {
  it('handles empty CSV', () => {
    const result = parseTickTickCsv('"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"\n');
    expect(result.tasks.length).toBe(0);
    expect(result.projects.length).toBe(0);
    expect(result.tags.length).toBe(0);
  });

  it('handles missing optional fields', () => {
    const csv = `"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"
"","Inbox","Simple task","","","N","","","","","0","0","2026-07-18T08:00:00+0000","","0","UTC","true","false",,,"list","10",""
`;
    const result = parseTickTickCsv(csv);
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].title).toBe('Simple task');
    expect(result.tasks[0].priority).toBeNull();
    expect(result.tasks[0].dueDate).toBeNull();
    expect(result.tasks[0].tags.length).toBe(0);
  });

  it('deduplicates recurring completed instances', () => {
    const csv = `"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"
"","Inbox","Daily task","","","N","","2026-07-20T08:00:00+0000","","FREQ=DAILY","0","0","2026-07-18T08:00:00+0000","","0","UTC","true","false",,,"list","20",""
"","Inbox","Daily task","","","N","","2026-07-19T08:00:00+0000","","","0","1","2026-07-18T08:00:00+0000","2026-07-19T09:00:00+0000","0","UTC","true","false",,,"list","20",""
`;
    const result = parseTickTickCsv(csv);
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].isCompleted).toBe(true);
  });

  it('skips the Date/Version/Status preamble TickTick prepends to real exports', () => {
    const csv = `"Date: 2026-07-23+0000"
"Version: 7.2"
"Status:
0 Normal
-1 Abandoned
2 Completed"
"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"
"","Inbox","Buy milk","","","N","","2026-07-20T10:00:00+0000","","","0","0","2026-07-18T08:00:00+0000","","0","UTC","true","false",,,"list","1",""
`;
    const result = parseTickTickCsv(csv);
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].title).toBe('Buy milk');
  });

  it('splits checklist items separated by a bare carriage return', () => {
    const csv = `"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"
"","Inbox","Checklist task","","▪item one\r▫item two\r▪item three","Y","","","","","0","0","2026-07-18T08:00:00+0000","","0","UTC","true","false",,,"list","30",""
`;
    const result = parseTickTickCsv(csv);
    expect(result.tasks[0].checklistItems).toEqual(['item one', 'item two', 'item three']);
  });
});

describe('importTickTickData — writes to the database', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser('ticktick-import-test@example.com');
    userId = user.user.id;
  });

  afterAll(async () => {
    await cleanupUsers([userId]);
  });

  it('creates tasks with due dates, start dates, checklists, and subtasks without crashing', async () => {
    // Regression test: prisma.task.create() rejects bare "YYYY-MM-DD" strings
    // for DateTime fields ("premature end of input. Expected ISO-8601
    // DateTime") — earlier code passed task.dueDate/startDate straight
    // through unconverted, so real imports crashed on the first dated task
    // (after already creating empty projects/tags).
    const csv = `"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"
"","Work","Dated task","","","N","2026-07-19T10:00:00+0000","2026-07-20T10:00:00+0000","","","0","0","2026-07-18T08:00:00+0000","","0","UTC","true","false","Job",,"kanban","1",""
"","Work","Checklist task","","▪item one\r▫item two","Y","","","","","0","0","2026-07-18T08:00:00+0000","","0","UTC","true","false","Job",,"kanban","2",""
"","Work","Completed task","","","N","","","","","0","2","2026-07-18T08:00:00+0000","2026-07-19T09:00:00+0000","0","UTC","true","false","Backlog",,"kanban","3",""
"","Work","Subtask","","","N","","","","","0","0","2026-07-18T08:00:00+0000","","0","UTC","true","false","Backlog",,"kanban","4","1"
`;
    const preview = parseTickTickCsv(csv);

    const result = await importTickTickData(userId, preview, false);
    expect(result.imported).toBe(4);
    expect(result.projectsCreated).toBe(1);

    const tasks = await prisma.task.findMany({ where: { userId }, orderBy: { title: 'asc' } });
    expect(tasks).toHaveLength(4);

    const dated = tasks.find((t) => t.title === 'Dated task')!;
    expect(dated.deadlineDate?.toISOString().slice(0, 10)).toBe('2026-07-20');
    expect(dated.dueDate).toBeNull();
    expect(dated.startDate?.toISOString().slice(0, 10)).toBe('2026-07-19');

    const checklist = tasks.find((t) => t.title === 'Checklist task')!;
    // B2.8: checklist items are stored as TaskChecklistItem records, not flattened in description
    expect(checklist.description).toBeNull();
    const checklistItems = await prisma.taskChecklistItem.findMany({ where: { taskId: checklist.id }, orderBy: { sortOrder: 'asc' } });
    expect(checklistItems).toHaveLength(2);
    expect(checklistItems[0].title).toBe('item one');
    expect(checklistItems[1].title).toBe('item two');

    const completed = tasks.find((t) => t.title === 'Completed task')!;
    expect(completed.completedAt).toBeInstanceOf(Date);

    const subtask = tasks.find((t) => t.title === 'Subtask')!;
    expect(subtask.parentId).toBe(dated.id);

    // Column Name from TickTick's Kanban view must map to real project
    // columns — not every task dumped into whatever renders first.
    expect(dated.projectColumnId).toBe(checklist.projectColumnId);
    expect(completed.projectColumnId).toBe(subtask.projectColumnId);
    expect(dated.projectColumnId).not.toBe(completed.projectColumnId);
    expect(dated.projectColumnId).not.toBeNull();

    const columns = await prisma.projectColumn.findMany({ where: { projectId: dated.projectId! } });
    expect(columns.map((c) => c.name).sort()).toEqual(['Backlog', 'Job']);
  });

  it('rolls back everything if one task in the batch fails to write', async () => {
    // Regression test for the exact real-world incident: a bad date crashed
    // task creation partway through, but the projects/tags created earlier
    // in the same run had already been committed and stayed behind as empty
    // shells. The whole import must be all-or-nothing.
    const preview = {
      tasks: [
        {
          title: 'Good task 1', content: '', isChecklist: false, startDate: null,
          dueDate: null, dueTime: null, rrule: null, priority: 4, isCompleted: false,
          completedAt: null, listName: 'Rollback Project', columnName: null, tags: ['rollback-tag'],
          tickTickTaskId: '1', tickTickParentId: '', checklistItems: [],
        },
        {
          title: 'Bad task', content: '', isChecklist: false, startDate: null,
          dueDate: 'not-a-real-date', dueTime: null, rrule: null, priority: 4, isCompleted: false,
          completedAt: null, listName: 'Rollback Project', columnName: null, tags: [],
          tickTickTaskId: '2', tickTickParentId: '', checklistItems: [],
        },
        {
          title: 'Good task 2', content: '', isChecklist: false, startDate: null,
          dueDate: null, dueTime: null, rrule: null, priority: 4, isCompleted: false,
          completedAt: null, listName: 'Rollback Project', columnName: null, tags: [],
          tickTickTaskId: '3', tickTickParentId: '', checklistItems: [],
        },
      ],
      projects: ['Rollback Project'],
      tags: ['rollback-tag'],
      stats: { total: 3, completed: 0, recurring: 0, checklists: 0, withDueDate: 1 },
    };

    await expect(importTickTickData(userId, preview, false)).rejects.toThrow();

    const tasks = await prisma.task.findMany({
      where: { userId, title: { in: ['Good task 1', 'Bad task', 'Good task 2'] } },
    });
    const projects = await prisma.project.findMany({ where: { userId, name: 'Rollback Project' } });
    const tags = await prisma.tag.findMany({ where: { userId, name: 'rollback-tag' } });
    expect(tasks).toHaveLength(0);
    expect(projects).toHaveLength(0);
    expect(tags).toHaveLength(0);
  });
});
