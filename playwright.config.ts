import { defineConfig, devices } from '@playwright/test';

const apiPort = Number(process.env.E2E_API_PORT ?? 3100);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'on-first-retry',
    // A fresh preview build is produced for every E2E command. Letting its
    // autoUpdate service worker activate can reload the page in the middle
    // of a mutation and detach the whole React tree. PWA behavior is covered
    // separately; browser interaction tests must run against one stable app.
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'node apps/api/dist/src/index.js',
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        DATABASE_URL: 'postgresql://mindoist_user:mindoist_pass@127.0.0.1:5432/mindoist_test',
        JWT_SECRET: 'e2e-test-secret-with-at-least-32-characters',
        MINDOIST_AGENT_TOKEN: 'e2e-agent-token-with-at-least-32-characters',
        NODE_ENV: 'test',
        PORT: String(apiPort),
      },
    },
    {
      command: `pnpm exec vite preview --host 127.0.0.1 --port ${webPort} --strictPort`,
      cwd: 'apps/web',
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        E2E_API_PORT: String(apiPort),
      },
    },
  ],
});
