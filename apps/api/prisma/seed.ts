import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const USER_EMAIL = 'hieu@mindoist.dev';

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);

  // ── User ──
  const user = await prisma.user.upsert({
    where: { email: USER_EMAIL },
    update: {},
    create: {
      email: USER_EMAIL,
      password: hashedPassword,
      name: 'Hiếu',
    },
  });

  // ── Clean existing seed data for this user (junction table via raw SQL) ──
  await prisma.taskTag.deleteMany({ where: { task: { userId: user.id } } });
  await prisma.task.deleteMany({ where: { userId: user.id } });
  await prisma.section.deleteMany({ where: { project: { userId: user.id } } });
  await prisma.tag.deleteMany({ where: { userId: user.id } });
  await prisma.project.deleteMany({ where: { userId: user.id } });

  // ── Projects ──
  const inbox = await prisma.project.create({
    data: { userId: user.id, name: 'Inbox', color: '#6366f1' },
  });

  const work = await prisma.project.create({
    data: { userId: user.id, name: 'Work', color: '#f59e0b' },
  });

  // ── Sections ──
  const todoSection = await prisma.section.create({
    data: { projectId: work.id, name: 'To Do', sortOrder: 1 },
  });
  const doneSection = await prisma.section.create({
    data: { projectId: work.id, name: 'Done', sortOrder: 2 },
  });

  // ── Tags ──
  const tagDefs = [
    { name: 'urgent', color: '#ef4444' },
    { name: 'low-effort', color: '#22c55e' },
    { name: 'research', color: '#8b5cf6' },
    { name: 'frontend', color: '#06b6d4' },
    { name: 'backend', color: '#059669' },
  ];
  const tags: Record<string, string> = {};
  for (const t of tagDefs) {
    const tag = await prisma.tag.create({ data: { userId: user.id, ...t } });
    tags[t.name] = tag.id;
  }

  // ── Tasks: 10 sample tasks ──
  const taskData = [
    // Inbox (3 tasks)
    { title: 'Review proposal section 7', projectId: inbox.id, priority: 3, tagNames: ['research'] },
    { title: 'Buy groceries', projectId: inbox.id, priority: 2, tagNames: ['low-effort'] },
    { title: 'Schedule dentist', projectId: inbox.id, priority: 1, tagNames: [] },
    // Work — To Do (5 tasks)
    { title: 'Implement Task CRUD API', projectId: work.id, sectionId: todoSection.id, priority: 4, tagNames: ['urgent'] },
    { title: 'Add recurring task logic', projectId: work.id, sectionId: todoSection.id, priority: 3, tagNames: ['urgent', 'research'] },
    { title: 'Build tag filter UI', projectId: work.id, sectionId: todoSection.id, priority: 2, tagNames: ['frontend'] },
    { title: 'Set up CI pipeline', projectId: work.id, sectionId: todoSection.id, priority: 3, tagNames: ['low-effort'] },
    { title: 'Fix login page bug', projectId: work.id, sectionId: todoSection.id, priority: 4, tagNames: ['urgent', 'frontend'] },
    // Work — Done (2 tasks)
    { title: 'Set up Prisma schema', projectId: work.id, sectionId: doneSection.id, priority: 1, completedAt: new Date(), tagNames: [] },
    { title: 'Configure Docker Compose', projectId: work.id, sectionId: doneSection.id, priority: 2, completedAt: new Date(), tagNames: ['low-effort'] },
  ];

  for (let i = 0; i < taskData.length; i++) {
    const t = taskData[i];
    await prisma.task.create({
      data: {
        userId: user.id,
        projectId: t.projectId,
        sectionId: t.sectionId ?? null,
        title: t.title,
        priority: t.priority,
        sortOrder: i + 1,
        completedAt: t.completedAt ?? null,
        taskTags: t.tagNames.length
          ? { create: t.tagNames.map((n) => ({ tagId: tags[n] })) }
          : undefined,
      },
    });
  }

  console.log(`Seed complete: 1 user, 2 projects, ${tagDefs.length} tags, 2 sections, ${taskData.length} tasks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
