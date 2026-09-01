import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

function uniqueEmail() {
  return `e2e-calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Calendar E2E User');
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

test('[B1.3] calendar priority legend and event identity remain responsive', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  await addTask(page, 'A urgent launch today p1', 'A urgent launch');
  await addTask(page, 'High review today p2', 'High review');
  await addTask(page, 'Medium planning today p3', 'Medium planning');
  await addTask(page, 'Low cleanup today p4', 'Low cleanup');
  await page.goto('/calendar?view=month&plan=0');

  const legend = page.getByRole('list', { name: 'Priority' });
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('P1 Urgent');
  await expect(legend).toContainText('P4 Low');

  const urgentEvent = page.locator('.mindoist-month-event').filter({ hasText: 'A urgent launch' }).first();
  await expect(urgentEvent).toBeVisible();
  await expect(urgentEvent).toHaveAttribute('title', 'A urgent launch');
  await expect(urgentEvent).toHaveCSS('border-left-color', /rgb|oklch|color/);

  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    await page.evaluate(() => document.fonts.ready);
    await expect(legend).toBeVisible();
    await expect(urgentEvent).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(pageErrors).toEqual([]);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/calendar-priority-${viewport.width}.png`,
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/calendar?view=week&plan=0');
  await expect(page.locator('.mindoist-calendar-grid')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${EVIDENCE_DIR}/calendar-week-1440.png`,
    fullPage: true,
  });
});
