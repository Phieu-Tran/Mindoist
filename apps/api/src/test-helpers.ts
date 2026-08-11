import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

export async function createTestUser(email: string) {
  const password = await bcrypt.hash('password123', 10);
  const name = email.split('@')[0];
  const user = await prisma.user.upsert({
    where: { email },
    update: { password, name },
    create: { email, password, name },
  });
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET);
  return { user, token };
}

/** Delete only data owned by the given user IDs — safe for parallel test files. */
export async function cleanupUsers(userIds: Array<string | undefined>) {
  const ids = userIds.filter((id): id is string => Boolean(id));
  if (!ids.length) return;
  await prisma.taskTag.deleteMany({ where: { task: { userId: { in: ids } } } });
  await prisma.note.deleteMany({ where: { userId: { in: ids } } });
  await prisma.reminder.deleteMany({ where: { task: { userId: { in: ids } } } });
  await prisma.gCalLink.deleteMany({ where: { task: { userId: { in: ids } } } });
  await prisma.task.deleteMany({ where: { userId: { in: ids } } });
  await prisma.section.deleteMany({ where: { project: { userId: { in: ids } } } });
  await prisma.project.deleteMany({ where: { userId: { in: ids } } });
  await prisma.tag.deleteMany({ where: { userId: { in: ids } } });
  await prisma.googleAccount.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
