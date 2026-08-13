import { prisma } from '../../src/db.js';
import { zonedDateTimeToUtc } from '../../src/tasks/deadline.js';
import {
  planLegacyScheduleMigration,
  type LegacyScheduleWarning,
} from '@mindoist/shared/scheduling';

/**
 * Migrate legacy due fields into the canonical deadline/TimeBlock model.
 *
 * The default mode is deliberately read-only. Pass --apply only after the
 * dry-run summary has been reviewed. Existing legacy columns are never
 * deleted, so old clients and backup exports remain readable.
 */
const apply = process.argv.includes('--apply');
const jsonOutput = process.argv.includes('--json');
const fallbackTimeZone = process.env.DEFAULT_TIMEZONE || 'Asia/Ho_Chi_Minh';

type LegacyTask = {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  dueTime: string | null;
  durationMin: number | null;
  estimateMin: number | null;
  deadlineDate: Date | null;
  deadlineTime: string | null;
  deadlineTimeZone: string | null;
  userId: string;
  user: { timeZone: string | null };
  timeBlocks: Array<{ id: string }>;
};

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function hasLegacyFields(task: LegacyTask): boolean {
  return task.startDate !== null || task.dueDate !== null || task.dueTime !== null || task.durationMin !== null;
}

async function main(): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      userId: true,
      startDate: true,
      dueDate: true,
      dueTime: true,
      durationMin: true,
      estimateMin: true,
      deadlineDate: true,
      deadlineTime: true,
      deadlineTimeZone: true,
      user: { select: { timeZone: true } },
      timeBlocks: { where: { deletedAt: null }, select: { id: true }, take: 1 },
    },
  });

  const warningCounts: Record<LegacyScheduleWarning, number> = {
    'ambiguous-date-range': 0,
    'duration-without-time': 0,
    'invalid-duration': 0,
    'invalid-date': 0,
    'invalid-time': 0,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun: !apply,
    totalTasks: tasks.length,
    candidates: 0,
    updatedTasks: 0,
    createdTimeBlocks: 0,
    warnings: warningCounts,
    samples: [] as Array<{ taskId: string; warnings: LegacyScheduleWarning[] }>,
  };

  for (const task of tasks) {
    if (!hasLegacyFields(task)) continue;
    const timeZone = task.user.timeZone || fallbackTimeZone;
    const migration = planLegacyScheduleMigration(
      {
        id: task.id,
        startDate: isoDate(task.startDate),
        dueDate: isoDate(task.dueDate),
        dueTime: task.dueTime,
        durationMin: task.durationMin,
      },
      timeZone,
    );

    for (const warning of migration.warnings) warningCounts[warning] += 1;
    if (migration.warnings.length && summary.samples.length < 25) {
      summary.samples.push({ taskId: task.id, warnings: migration.warnings });
    }

    const deadline = migration.deadline;
    const candidate = migration.timeBlockCandidate;
    if (deadline || (task.estimateMin == null && task.durationMin != null)) summary.candidates += 1;
    if (!apply) continue;

    const taskData: Record<string, unknown> = {};
    if (task.deadlineDate == null && deadline) taskData.deadlineDate = new Date(`${deadline.date}T00:00:00.000Z`);
    if (task.deadlineTime == null && deadline?.time) taskData.deadlineTime = deadline.time;
    if (task.deadlineTimeZone == null && deadline?.timeZone) taskData.deadlineTimeZone = deadline.timeZone;
    if (task.estimateMin == null && task.durationMin != null) taskData.estimateMin = task.durationMin;

    if (Object.keys(taskData).length > 0) {
      await prisma.task.update({ where: { id: task.id }, data: taskData });
      summary.updatedTasks += 1;
    }

    if (candidate && task.timeBlocks.length === 0) {
      await prisma.timeBlock.create({
        data: {
          userId: task.userId,
          taskId: task.id,
          startAt: zonedDateTimeToUtc(candidate.startLocal.slice(0, 10), candidate.startLocal.slice(11), candidate.timeZone),
          endAt: zonedDateTimeToUtc(candidate.endLocal.slice(0, 10), candidate.endLocal.slice(11), candidate.timeZone),
          timeZone: candidate.timeZone,
          source: 'IMPORT',
        },
      });
      summary.createdTimeBlocks += 1;
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Legacy schedule backfill (${apply ? 'APPLY' : 'dry-run; no writes performed'})`);
    console.log(`Tasks scanned: ${summary.totalTasks}`);
    console.log(`Candidates: ${summary.candidates}`);
    console.log(`Updated tasks: ${summary.updatedTasks}`);
    console.log(`Created TimeBlocks: ${summary.createdTimeBlocks}`);
    console.log('Warnings:', summary.warnings);
    if (summary.samples.length) console.table(summary.samples);
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
