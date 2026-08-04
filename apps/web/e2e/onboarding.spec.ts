import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/google-onboarding-2026-08-01';
const TEST_DATABASE_URL =
  'postgresql://mindoist_user:mindoist_pass@127.0.0.1:5432/mindoist_test';

async function requireOnboarding(email: string) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { prisma } = await import('../../api/src/db.js');
  await prisma.user.update({
    where: { email },
    data: { onboardingRequired: true },
  });
  await prisma.$disconnect();
}

test.describe('Google account onboarding', () => {
  test('[AUTH-04] confirms profile, explains the workspace, and creates an optional password', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const email = `google-onboarding-${Date.now()}-${testInfo.workerIndex}@example.test`;
    const originalPassword = 'e2e-password';
    const backupPassword = 'backup-password';

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await page.getByLabel('Name').fill('Google Name');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(originalPassword);
    await page.getByLabel('Confirm Password').fill(originalPassword);
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Google itself is external to the E2E harness. Arrange the exact durable
    // state its verified callback creates, then exercise every remaining step
    // through the real web, API, and test database.
    await requireOnboarding(email);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Make this workspace yours' })).toBeVisible();

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 900 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({
        path: `${EVIDENCE_DIR}/profile-${viewport.width}.png`,
        fullPage: true,
      });
    }

    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('heading', { name: 'Make this workspace yours' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: `${EVIDENCE_DIR}/profile-dark-1440.png`, fullPage: true });

    await page.getByLabel('Name').fill('Minh Onboarding');
    await page.getByLabel('Time zone').selectOption('Asia/Saigon');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'From capture to a clear day' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Add a backup way to sign in' })).toBeVisible();

    await page.getByLabel('New password').fill(backupPassword);
    await page.getByLabel('Confirm Password').fill(backupPassword);
    await page.getByRole('button', { name: 'Create password and start' }).click();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Make this workspace yours' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(backupPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });
});
