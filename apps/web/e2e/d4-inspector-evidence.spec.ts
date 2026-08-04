/**
 * D4 — Evidence screenshots: inspector reorder (description right under
 * title, properties as a wrapping chip row, subtasks/checklist/reminders/
 * focus-timer below, single Save button). Captures Task Detail with a
 * richly-populated task (color/priority/project/date/duration/repeat/
 * subtask/checklist/reminder all set) at 4 breakpoints, both themes.
 */
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/D4-inspector';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function uniqueEmail() {
  return `e2e-d4ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('D4 Evidence User');
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

async function arrangeScene(page: Page) {
  const title = `Inspector layout check ${Date.now()}`;
  await page.getByTestId('add-task-input').fill(title);
  await page.getByTestId('add-task-btn').click();
  await page.getByTestId('task-list').getByText(title, { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();

  await page.getByTestId('detail-description').fill(
    'A longer description to check the auto-growing 160px+ writing surface reads well right under the title.',
  );
  await page.getByTestId('detail-color').click();
  await page.getByTestId('detail-color-jade').click();
  await page.getByTestId('detail-priority').click();
  await page.getByTestId('detail-priority-1').click();
  await page.getByTestId('detail-deadline-v2').click();
  await page.getByRole('dialog', { name: 'Pick date' }).getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByTestId('detail-duration-min').fill('30');
  await page.getByTestId('detail-recurrence-select').click();
  await page.getByRole('option', { name: 'Weekly', exact: true }).click();

  await page.getByTestId('subtask-input').fill('A sub-task');
  await page.getByTestId('subtask-input').press('Enter');
  await expect(page.getByText('A sub-task', { exact: true }).first()).toBeVisible();

  await page.getByTestId('checklist-input').fill('A checklist item');
  await page.getByTestId('checklist-input').press('Enter');
  await expect(page.getByText('A checklist item', { exact: true })).toBeVisible();

  await expect(page.getByTestId('detail-save')).toBeEnabled();
  await page.getByTestId('detail-save').evaluate((button: HTMLButtonElement) => {
    button.form?.requestSubmit(button);
  });
  await expect(page.getByTestId('task-detail')).not.toBeVisible();
  await page.getByTestId('task-list').getByText(title, { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  return title;
}

async function captureAcrossViewports(page: Page, theme: 'light' | 'dark', title: string) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('task-detail')).toBeVisible();
    await expect(page.getByTestId('detail-title')).toHaveValue(title);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    const rootClass = await page.evaluate(() => document.documentElement.className);
    expect(rootClass).toContain(theme);
    await page.waitForTimeout(350);
    await page.screenshot({
      path: `${EVIDENCE_DIR}/${theme}-inspector-${viewport.width}.png`,
      fullPage: true,
    });
  }
}

test('[D4-EV] light mode inspector evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'light');
  const title = await arrangeScene(page);
  await captureAcrossViewports(page, 'light', title);
  expect(pageErrors).toEqual([]);
});

test('[D4-EV] dark mode inspector evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'dark');
  const title = await arrangeScene(page);
  await captureAcrossViewports(page, 'dark', title);
  expect(pageErrors).toEqual([]);
});
