import { expect, test, type Page } from '@playwright/test';

function uniqueEmail() {
  return `e2e-summary-calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Summary Calendar E2E User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function addTask(page: Page, value: string, title: string) {
  await page.keyboard.press('Control+k');
  await page.getByTestId('global-quick-capture-input').fill(value);
  await page.getByTestId('global-quick-capture-submit').click();
  await expect(page.getByTestId('global-quick-capture')).toBeHidden();
  await expect(page.getByTestId('task-list').getByText(title, { exact: true })).toBeVisible();
}

test('[MORE-01] Summary keeps task details in context and offers weekly/monthly reviews', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  await addTask(page, 'Write proposal today p1', 'Write proposal');
  await addTask(page, 'Completed plan today p3', 'Completed plan');
  await addTask(page, 'Follow-up yesterday p2', 'Follow-up');
  const completedRow = page.getByTestId(/^task-[0-9a-f-]{36}$/).filter({ hasText: 'Completed plan' });
  await completedRow.locator('button[data-testid^="task-toggle-"]').click();

  await page.getByTestId('sidebar-summary').click();
  await expect(page).toHaveURL(/\/review(?:\?.*)?$/);
  await expect(page.getByTestId('summary-dashboard')).toBeVisible();
  await expect(page.getByTestId('summary-calendar')).toBeVisible();
  await expect(page.getByText('Calendar overview')).toBeVisible();
  await page.getByRole('button', { name: /Write proposal/ }).click();
  await expect(page).toHaveURL(/\/review(?:\?.*)?$/);
  await expect(page.getByTestId('summary-dashboard')).toBeVisible();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await page.getByTestId('detail-close-desktop').click();
  await expect(page.getByTestId('task-detail')).toHaveCount(0);
  await expect(page).toHaveURL(/\/review(?:\?.*)?$/);

  await page.getByTestId('summary-view-list').click();
  await expect(page.getByTestId('summary-monthly-list')).toBeVisible();
  const monthTotal = Number(await page.getByTestId('summary-month-total').locator('strong').textContent());
  expect(monthTotal).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Open Write proposal' }).click();
  await expect(page).toHaveURL(/\/review(?:\?.*)?$/);
  await expect(page.getByTestId('summary-monthly-list')).toBeVisible();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await page.getByTestId('detail-close-desktop').click();

  await page.getByTestId('summary-open-obsidian').click();
  await expect(page).toHaveURL(/\/settings(?:\?.*)?$/);
  await expect(page.getByTestId('settings-panel-integrations')).toBeVisible();
  await page.getByTestId('obsidian-vault-input').fill('Hiếu - Personal');
  await page.getByTestId('obsidian-folder-input').fill('03_Project/Mindoist');
  await page.getByTestId('obsidian-filename-input').fill('Tổng kết Mindoist {{yyyy-MM}}');
  await page.getByTestId('obsidian-weekly-filename-input').fill('Tổng kết tuần {{weekStart}}');
  await page.getByTestId('obsidian-settings-save').click();
  await expect(page.getByTestId('obsidian-settings-saved')).toHaveText('Saved');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.getByTestId('obsidian-settings-save').boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByTestId('sidebar-summary').click();
  await expect(page).toHaveURL(/\/review(?:\?.*)?$/);
  await page.getByTestId('summary-view-week').click();
  await expect(page.getByTestId('summary-weekly-list')).toBeVisible();
  expect(Number(await page.getByTestId('summary-week-total').locator('strong').textContent())).toBeGreaterThanOrEqual(2);
  await page.getByTestId('summary-preview-markdown').click();
  await expect(page.getByTestId('summary-markdown-preview')).toContainText('type: mindoist-weekly-review');
  await expect(page.getByTestId('summary-markdown-preview')).toContainText('- [');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.getByTestId('summary-preview-markdown').boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 812, height: 375 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByTestId('summary-view-list').click();
  await expect(page.getByText(/Destination: Hiếu - Personal \/ 03_Project\/Mindoist\/Tổng kết Mindoist/)).toBeVisible();
  await expect(page.getByTestId('summary-open-obsidian')).toHaveText('Send to Obsidian');

  await page.goto('/calendar?view=month&plan=0');
  await expect(page).toHaveURL(/\/calendar\?view=month&plan=(?:0|false)$/);
  await expect(page.locator('.mindoist-month-grid')).toBeVisible();
  await expect(
    page.locator('.mindoist-month-event').filter({ hasText: 'Write proposal' }).first(),
  ).toBeVisible();
  const completedCalendarEvent = page.locator('.mindoist-month-event.calendar-task-event-completed')
    .filter({ hasText: 'Completed plan' })
    .first();
  await expect(completedCalendarEvent).toBeVisible();
  expect(await completedCalendarEvent.locator('span').last().evaluate(element => (
    getComputedStyle(element).textDecorationLine
  ))).toContain('line-through');

  await page.goto('/calendar?view=5day&plan=0');
  const timeGrid = page.locator('.mindoist-time-grid').first();
  await expect(timeGrid).toBeVisible();
  expect(await timeGrid.evaluate(element => parseFloat(getComputedStyle(element).minHeight))).toBeGreaterThanOrEqual(1496);
  expect(await page.locator('.mindoist-calendar-hours span').nth(1).evaluate(element => (
    parseFloat(getComputedStyle(element).fontSize)
  ))).toBeGreaterThanOrEqual(12);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goBack();
  await expect(page).toHaveURL(/\/calendar\?view=month/);
  await page.goBack();
  await expect(page).toHaveURL(/\/review(?:\?.*)?$/);
  await expect(page.getByTestId('summary-dashboard')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
