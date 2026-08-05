import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

function uniqueEmail() {
  return `e2e-summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Summary E2E User');
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

async function completeTask(page: Page, title: string) {
  const row = page.getByTestId(/^task-[0-9a-f-]{36}$/).filter({ hasText: title });
  const checkbox = row.locator('button[data-testid^="task-toggle-"]');
  await checkbox.click();
  await expect(checkbox).toBeChecked();
}

test('[MORE-01] Summary keeps week, month, year, project filter, trend, and calendar overview', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  await addTask(page, 'Overdue critical yesterday p1', 'Overdue critical');
  await addTask(page, 'Active review today p2', 'Active review');
  await addTask(page, 'Completed plan today p3', 'Completed plan');
  await addTask(page, 'Completed cleanup p4', 'Completed cleanup');
  await completeTask(page, 'Completed plan');
  await completeTask(page, 'Completed cleanup');
  await page.getByTestId('undo-toast-dismiss').last().click();
  await expect(page.getByTestId('undo-toast')).toHaveCount(0);

  await page.getByTestId('sidebar-summary').click();
  await expect(page.getByTestId('summary-dashboard')).toBeVisible();
  await expect(page.getByTestId('summary-dashboard').getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(page.getByTestId('summary-total')).toBeVisible();
  await expect(page.getByTestId('summary-open')).toBeVisible();
  await expect(page.getByTestId('summary-completed')).toBeVisible();
  await expect(page.getByTestId('summary-range-week')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('summary-range-month').click();
  await expect(page.getByTestId('summary-range-month')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('summary-range-year').click();
  await expect(page.getByTestId('summary-range-year')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Calendar overview')).toBeVisible();
  await expect(page.getByText('Completion trend')).toBeVisible();
  await page.getByTestId('summary-project-filter').selectOption({ label: 'No project' });
  await expect(page.getByTestId('summary-project-filter')).toHaveValue('none');

  const viewports = [
    { width: 375, height: 667 },
    { width: 768, height: 900 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('summary-dashboard')).toBeVisible();
    await expect(page.getByTestId('summary-open')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(pageErrors).toEqual([]);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/summary-${viewport.width}.png`,
      fullPage: true,
    });
  }
});
