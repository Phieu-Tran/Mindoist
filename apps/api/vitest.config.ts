import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://mindoist_user:mindoist_pass@localhost:5432/mindoist_test',
      JWT_SECRET: 'test-secret-key',
      NODE_ENV: 'test',
    },
    globalSetup: ['./vitest.global-setup.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
