/**
 * B1.12 — Capture dark-mode calendar evidence at 4 breakpoints.
 * Run with: npx playwright test e2e/b1.12-dark-evidence.ts
 * Requires the API + web preview servers (via playwright.config.ts webServer).
 */
import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

function uniqueEmail() {
  return `e2e-b112-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('B1.12 Evidence User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function addTask(page: Page, value: string, title: string) {
  await page.getByTestId('add-task-input').fill(value);
  await page.getByTestId('add-task-btn').click();
  await expect(page.getByTestId('task-list').getByText(title, { exact: true })).toBeVisible();
}

async function setDarkMode(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
  });
  // Apply dark mode via the same mechanism the app uses
  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add('dark');
  });
  // Verify dark mode is active
  const hasDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  );
  expect(hasDark).toBe(true);
  // Wait for CSS to re-render
  await page.waitForTimeout(300);
}

test('[B1.12] dark-mode calendar evidence — Month + Week × 4 breakpoints', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);

  // Seed tasks with different priorities (at least 3)
  await addTask(page, 'Critical deploy today p1', 'Critical deploy');
  await addTask(page, 'Design review today p2', 'Design review');
  await addTask(page, 'Write docs today p3', 'Write docs');
  await addTask(page, 'Low priority fix today p4', 'Low priority fix');

  // Switch to dark mode and verify
  await setDarkMode(page);

  // Navigate to Calendar
  await page.goto('/calendar?view=month&plan=0');
  await expect(page.locator('.fc-daygrid')).toBeVisible();

  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  // Month view screenshots
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    await page.evaluate(() => document.fonts.ready);
    // Verify dark mode is still active after resize
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(isDark).toBe(true);
    // Verify header row has no white background
    const headerBg = await page.evaluate(() => {
      const header = document.querySelector('.fc-scrollgrid-section-header');
      if (!header) return 'no-header';
      const bg = getComputedStyle(header).backgroundColor;
      return bg;
    });
    // White would be rgb(255, 255, 255) — it should NOT be that
    expect(headerBg).not.toBe('rgb(255, 255, 255)');

    await expect(page.locator('.fc-daygrid')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/calendar-dark-month-${viewport.width}.png`,
      fullPage: true,
    });
  }

  // Switch to Week view (the switcher is a day-count dropdown)
  await page.getByTestId('calendar-view-switch').click();
  await page.getByRole('option', { name: '7 days', exact: true }).click();
  await expect(page.locator('.fc-timegrid')).toBeVisible();

  // Week view screenshots
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    await page.evaluate(() => document.fonts.ready);
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(isDark).toBe(true);

    await expect(page.locator('.fc-timegrid')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/calendar-dark-week-${viewport.width}.png`,
      fullPage: true,
    });
  }

  expect(pageErrors).toEqual([]);
});
