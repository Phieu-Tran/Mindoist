import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export default async function setup() {
  const databaseUrl = 'postgresql://mindoist_user:mindoist_pass@localhost:5432/mindoist_test';
  process.env.DATABASE_URL = databaseUrl;

  await execAsync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
