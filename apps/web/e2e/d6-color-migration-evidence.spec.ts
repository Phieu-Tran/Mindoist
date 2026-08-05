/**
 * D6 — Evidence screenshots: remaining `color-mix(in srgb)` migrated to
 * `in oklch` (92 safe occurrences) plus the 7 hue-drag-risk ones rewritten
 * with relative color syntax (calendar event pill, priority-colored
 * events). Captures a lime-colored task's calendar event pill and a
 * colored countdown card at 4 breakpoints, both themes, to show the correct
 * (non-drifted) hue.
 */
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/D6-color-migration';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function uniqueEmail() {
  return `e2e-d6ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('D6 Evidence User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(mode => {
    localStorage.setItem('theme', mode);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(mode);
  }, theme);
  const applied = await page.evaluate(() => document.documentElement.className);
  expect(applied).toContain(theme);
  expect(applied).not.toContain(theme === 'light' ? 'dark' : 'light');
  await page.waitForTimeout(250);
}

async function arrangeCalendarScene(page: Page) {
  const title = `Lime hue-safe event ${Date.now()}`;
  await page.getByTestId('add-task-input').fill(title);
  await page.getByTestId('add-task-btn').click();
  await page.getByTestId('task-list').getByText(title, { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await page.getByTestId('detail-color').click();
  await page.getByTestId('detail-color-lime').click();
  await page.getByTestId('detail-deadline-v2').click();
  await page.getByRole('dialog', { name: 'Pick date' }).getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByTestId('detail-save').evaluate((button: HTMLButtonElement) => {
    button.form?.requestSubmit(button);
  });
  await expect(page.getByTestId('task-detail')).not.toBeVisible();
}

test('[D6-EV] light mode calendar + countdown color evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'light');
  await arrangeCalendarScene(page);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${EVIDENCE_DIR}/light-calendar-${viewport.width}.png`, fullPage: true });
  }
  expect(pageErrors).toEqual([]);
});

test('[D6-EV] dark mode calendar + countdown color evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'dark');
  await arrangeCalendarScene(page);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${EVIDENCE_DIR}/dark-calendar-${viewport.width}.png`, fullPage: true });
  }
  expect(pageErrors).toEqual([]);
});
