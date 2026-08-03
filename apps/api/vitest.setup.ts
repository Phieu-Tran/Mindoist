import { afterAll } from 'vitest';

afterAll(async () => {
  // Cleanup after all tests
  try {
    const { prisma } = await import('./src/db.js');
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to disconnect:', error);
  }
});
