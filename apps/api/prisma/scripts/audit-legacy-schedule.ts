import { prisma } from '../../src/db.js';
import { planLegacyScheduleMigration, type LegacyScheduleWarning } from '@mindoist/shared/scheduling';

const fallbackTimeZone = process.env.DEFAULT_TIMEZONE || 'Asia/Ho_Chi_Minh';
const jsonOutput = process.argv.includes('--json');

type LegacyTask = {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  dueTime: string | null;
  durationMin: number | null;
  user: { timeZone: string | null };
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function hasLegacySchedule(task: LegacyTask): boolean {
  return task.startDate !== null
    || task.dueDate !== null
    || task.dueTime !== null
    || task.durationMin !== null;
}

async function main(): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      startDate: true,
      dueDate: true,
      dueTime: true,
      durationMin: true,
      user: { select: { timeZone: true } },
    },
  });

  const warnings: Record<LegacyScheduleWarning, number> = {
    'ambiguous-date-range': 0,
    'duration-without-time': 0,
    'invalid-duration': 0,
    'invalid-date': 0,
    'invalid-time': 0,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    totalTasks: tasks.length,
    tasksWithLegacySchedule: 0,
    tasksWithoutLegacySchedule: 0,
    clean: 0,
    withTimeBlockCandidate: 0,
    fallbackTimeZoneTasks: 0,
    warnings,
    samples: [] as Array<{ taskId: string; warnings: LegacyScheduleWarning[] }>,
  };

  for (const task of tasks) {
    if (!hasLegacySchedule(task)) {
      summary.tasksWithoutLegacySchedule += 1;
      continue;
    }

    summary.tasksWithLegacySchedule += 1;
    const timeZone = task.user.timeZone || fallbackTimeZone;
    if (!task.user.timeZone) summary.fallbackTimeZoneTasks += 1;

    const result = planLegacyScheduleMigration({
      id: task.id,
      startDate: toIsoDate(task.startDate),
      dueDate: toIsoDate(task.dueDate),
      dueTime: task.dueTime,
      durationMin: task.durationMin,
    }, timeZone);

    if (result.timeBlockCandidate) summary.withTimeBlockCandidate += 1;
    if (result.warnings.length === 0) {
      summary.clean += 1;
    } else {
      for (const warning of result.warnings) warnings[warning] += 1;
      if (summary.samples.length < 25) {
        summary.samples.push({ taskId: task.id, warnings: result.warnings });
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('Legacy schedule audit (dry-run; no writes performed)');
    console.log(`Tasks: ${summary.totalTasks}`);
    console.log(`Legacy schedule: ${summary.tasksWithLegacySchedule}`);
    console.log(`Clean: ${summary.clean}`);
    console.log(`TimeBlock candidates: ${summary.withTimeBlockCandidate}`);
    console.log(`Fallback timezone (${fallbackTimeZone}): ${summary.fallbackTimeZoneTasks}`);
    console.log('Warnings:', summary.warnings);
    if (summary.samples.length > 0) console.table(summary.samples);
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
