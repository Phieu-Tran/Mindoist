/**
 * B1.15 — Evidence screenshots: Task Detail side panel with custom date
 * pickers, date range (startDate → dueDate) and sub-tasks, captured at
 * 375/768/1024/1440 in BOTH light and dark mode. Theme is verified via
 * the root element class before every screenshot (B1.11 lesson).
 */
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/B1.15-task-detail-ux';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function uniqueEmail() {
  return `e2e-b115ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('B1.15 Evidence User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

// Deadline and planned time are intentionally separate in Task Detail v2.
// This evidence scene sets only the deadline through the shared date picker.
async function pickDeadline(page: Page, due: Date) {
  await page.getByTestId('detail-deadline-v2').click();
  const popup = page.getByRole('dialog', { name: 'Pick date' });
  await expect(popup).toBeVisible();

  const dueMonthLabel = due.toLocaleString('en', { month: 'long', year: 'numeric' });
  for (let i = 0; i < 2; i++) {
    if (await popup.getByText(dueMonthLabel, { exact: true }).isVisible()) break;
    await popup.getByRole('button', { name: 'Next month' }).click();
  }
  await popup.getByRole('button', { name: String(due.getDate()), exact: true }).click();
  await expect(popup).not.toBeVisible();
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

async function arrangeDetailScene(page: Page) {
  const title = `Plan sprint retro ${Date.now()}`;
  await page.getByTestId('add-task-input').fill(title);
  await page.getByTestId('add-task-btn').click();
  const titleTestId = await page.getByText(title, { exact: true }).getAttribute('data-testid');
  const parentId = titleTestId!.replace('task-title-', '');
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();

  // Date range: today → +3 days via the custom pickers
  const due = new Date();
  due.setDate(due.getDate() + 3);
  await pickDeadline(page, due);

  // Sub-tasks: one open, one completed; wait for the list indicator to
  // settle after each refetch before interacting further.
  await page.getByTestId('subtask-input').fill('Draft agenda');
  await page.getByTestId('subtask-input').press('Enter');
  await expect(page.getByText('Draft agenda', { exact: true }).first()).toBeVisible();
  await page.getByTestId('subtask-input').fill('Book room');
  await page.getByTestId('subtask-input').press('Enter');
  await expect(page.getByText('Book room', { exact: true }).first()).toBeVisible();
  const firstSubtask = page.locator('[data-testid="detail-subtasks"] [data-testid^="subtask-"]').first();
  await firstSubtask.locator('button[role="checkbox"]').click();
  await expect(firstSubtask.locator('button[role="checkbox"]')).toHaveAttribute('data-state', 'checked');
  await expect(page.getByTestId(`task-subtasks-${parentId}`)).toContainText('1/2');

  await expect(page.getByTestId('detail-save')).toBeEnabled();
  await page.getByTestId('detail-save').evaluate((button: HTMLButtonElement) => {
    button.form?.requestSubmit(button);
  });
  await expect(page.getByTestId('task-detail')).not.toBeVisible();

  // A future deadline intentionally leaves My Day, so reopen it from All.
  await page.getByTestId('sidebar-all').click();
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await expect(page.getByTestId('detail-deadline-v2')).not.toHaveText('Add date');
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
      path: `${EVIDENCE_DIR}/${theme}-detail-${viewport.width}.png`,
      fullPage: true,
    });
  }
}

test('[B1.15-EV] light mode task detail evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'light');
  const title = await arrangeDetailScene(page);
  await captureAcrossViewports(page, 'light', title);
  expect(pageErrors).toEqual([]);
});

test('[B1.15-EV] dark mode task detail evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'dark');
  const title = await arrangeDetailScene(page);
  await captureAcrossViewports(page, 'dark', title);
  expect(pageErrors).toEqual([]);
});
