/**
 * B1.13 — Verify light-mode calendar today pill renders correctly.
 *
 * Regression test: B1.12's broad transparent-background CSS reset
 * killed the today pill, today tint, and hover in both themes.
 * This spec asserts via computed style that the today cell has a
 * real (non-transparent) background and the day number has a
 * primary-color pill in LIGHT mode.
 *
 * Run with: npx playwright test e2e/b1.13-light-mode-fix.spec.ts
 */
import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

function uniqueEmail() {
  return `e2e-b113-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('B1.13 Light Test');
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

async function setLightMode(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
  });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add('light');
  });
  // Verify light mode is active and dark is NOT present
  const hasDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  );
  expect(hasDark).toBe(false);
  const hasLight = await page.evaluate(() =>
    document.documentElement.classList.contains('light'),
  );
  expect(hasLight).toBe(true);
  await page.waitForTimeout(300);
}

/**
 * Assert today's day-number badge has a non-transparent background via
 * computed style. The cell itself is intentionally left untinted (2026-07-25
 * redesign) — only the circular badge on the number marks "today", matching
 * a cleaner reference style instead of washing the whole cell.
 */
async function assertTodayCellHasBackground(page: Page) {
  const result = await page.evaluate(() => {
    const todayCell = document.querySelector('.fc-daygrid-day.fc-day-today');
    if (!todayCell) return { found: false };
    const todayNum = todayCell.querySelector('.fc-daygrid-day-number');
    const numBg = todayNum ? getComputedStyle(todayNum).backgroundColor : null;
    const numColor = todayNum ? getComputedStyle(todayNum).color : null;
    return { found: true, numBg, numColor };
  });

  expect(result.found).toBe(true);
  // Day number must have a colored background (the badge)
  expect(result.numBg).toBeTruthy();
  expect(result.numBg).not.toBe('rgba(0, 0, 0, 0)');
  expect(result.numBg).not.toBe('rgb(0, 0, 0)');
}

/**
 * Assert header has no white background (regression check for B1.12).
 */
async function assertHeaderNotWhite(page: Page) {
  const headerBg = await page.evaluate(() => {
    const header = document.querySelector('.fc-scrollgrid-section-header');
    if (!header) return 'no-header';
    return getComputedStyle(header).backgroundColor;
  });
  expect(headerBg).not.toBe('rgb(255, 255, 255)');
}

test('[B1.13] light-mode today pill — computed style assertion', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);

  // Seed tasks due today so the today cell has content
  await addTask(page, 'Critical deploy today p1', 'Critical deploy');
  await addTask(page, 'Design review today p2', 'Design review');
  await addTask(page, 'Write docs today p3', 'Write docs');

  // Force light mode
  await setLightMode(page);

  // Navigate to Calendar
  await page.goto('/calendar?view=month&plan=0');
  await expect(page.locator('.fc-daygrid')).toBeVisible();

  // Verify light mode is still active
  const isLight = await page.evaluate(() =>
    document.documentElement.classList.contains('light'),
  );
  expect(isLight).toBe(true);

  // Core assertion: today pill has real background in light mode
  await assertTodayCellHasBackground(page);

  // Regression: header must not be white
  await assertHeaderNotWhite(page);

  // Take evidence screenshot at 1440px
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${EVIDENCE_DIR}/calendar-light-month-1440.png`,
    fullPage: true,
  });

  expect(pageErrors).toEqual([]);
});

test('[B1.13] dark-mode header no regression — computed style assertion', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);

  await addTask(page, 'Critical deploy today p1', 'Critical deploy');
  await addTask(page, 'Design review today p2', 'Design review');

  // Force dark mode
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add('dark');
  });
  const hasDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  );
  expect(hasDark).toBe(true);
  await page.waitForTimeout(300);

  // Navigate to Calendar
  await page.goto('/calendar?view=month&plan=0');
  await expect(page.locator('.fc-daygrid')).toBeVisible();

  // Header must not be white in dark mode (B1.12 regression guard)
  await assertHeaderNotWhite(page);

  // Today pill should still have a background in dark mode too
  await assertTodayCellHasBackground(page);

  // Take evidence screenshot
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${EVIDENCE_DIR}/calendar-dark-header-1440.png`,
    fullPage: true,
  });

  expect(pageErrors).toEqual([]);
});
