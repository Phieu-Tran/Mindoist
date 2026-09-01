/**
 * D3 — Evidence screenshots: redesigned task row (merged due+countdown
 * chip, priority/project chips, task-color row background, fixed-height
 * empty row). Captures Inbox with a mix of plain and metadata-rich tasks
 * at 375/768/1024/1440, both themes.
 */
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/D3-task-row';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function uniqueEmail() {
  return `e2e-d3ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('D3 Evidence User');
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
  // Plain task — no metadata, exercises the fixed-height empty row.
  await page.keyboard.press('Control+k');
  await page.getByTestId('global-quick-capture-input').fill('Plain task, no metadata');
  await page.getByTestId('global-quick-capture-submit').click();
  await expect(page.getByTestId('global-quick-capture')).toBeHidden();
  await expect(page.getByText('Plain task, no metadata', { exact: true })).toBeVisible();

  // Rich task — due date + time (merged countdown chip), priority, color,
  // and a sub-task so the subtask chip renders too.
  const richTitle = 'Rich task with full metadata';
  await page.keyboard.press('Control+k');
  await page.getByTestId('global-quick-capture-input').fill(richTitle);
  await page.getByTestId('global-quick-capture-submit').click();
  await expect(page.getByTestId('global-quick-capture')).toBeHidden();
  await page.getByRole('button', { name: richTitle, exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();

  await page.getByTestId('detail-color').click();
  await page.getByTestId('detail-color-jade').click();
  await page.getByTestId('detail-priority').click();
  await page.getByTestId('detail-priority-1').click();
  await page.getByTestId('detail-deadline-v2').click();
  await page.getByRole('dialog', { name: 'Pick date' }).getByRole('button', { name: 'Today', exact: true }).click();

  await page.getByTestId('subtask-input').fill('A sub-task');
  await page.getByTestId('subtask-input').press('Enter');
  await expect(page.getByText('A sub-task', { exact: true }).first()).toBeVisible();

  await expect(page.getByTestId('detail-save')).toBeEnabled();
  await page.getByTestId('detail-save').evaluate((button: HTMLButtonElement) => {
    button.form?.requestSubmit(button);
  });
  await expect(page.getByTestId('task-detail')).not.toBeVisible();
}

async function captureAcrossViewports(page: Page, theme: 'light' | 'dark') {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText('Plain task, no metadata', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    const rootClass = await page.evaluate(() => document.documentElement.className);
    expect(rootClass).toContain(theme);
    await page.waitForTimeout(350);
    await page.screenshot({
      path: `${EVIDENCE_DIR}/${theme}-rows-${viewport.width}.png`,
      fullPage: true,
    });
  }
}

test('[D3-EV] light mode task row evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'light');
  await arrangeScene(page);
  await captureAcrossViewports(page, 'light');
  expect(pageErrors).toEqual([]);
});

test('[D3-EV] dark mode task row evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'dark');
  await arrangeScene(page);
  await captureAcrossViewports(page, 'dark');
  expect(pageErrors).toEqual([]);
});
