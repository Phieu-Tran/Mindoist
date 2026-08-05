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
  await page.getByTestId('add-task-input').fill(value);
  await page.getByTestId('add-task-btn').click();
  await expect(page.getByTestId('task-list').getByText(title, { exact: true })).toBeVisible();
}

test('[MORE-01] Summary calendar links to real tasks while Calendar remains a separate primary route', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  await addTask(page, 'Write proposal today p1', 'Write proposal');
  await addTask(page, 'Completed plan today p3', 'Completed plan');
  await addTask(page, 'Follow-up yesterday p2', 'Follow-up');
  const completedRow = page.getByTestId(/^task-[0-9a-f-]{36}$/).filter({ hasText: 'Completed plan' });
  await completedRow.locator('button[data-testid^="task-toggle-"]').click();

  await page.getByTestId('sidebar-summary').click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByTestId('summary-dashboard')).toBeVisible();
  await expect(page.getByTestId('summary-calendar')).toBeVisible();
  await expect(page.getByText('Calendar overview')).toBeVisible();
  await page.getByRole('button', { name: /Write proposal/ }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await page.getByTestId('detail-close-desktop').click();
  await expect(page.getByTestId('task-detail')).toHaveCount(0);

  await page.goto('/calendar?view=month&plan=0');
  await expect(page).toHaveURL(/\/calendar\?view=month&plan=0$/);
  await expect(page.locator('.fc-daygrid')).toBeVisible();
    await expect(
      page.locator('.fc-event-title').filter({ hasText: 'Write proposal' }).first(),
    ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goBack();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByTestId('summary-dashboard')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
