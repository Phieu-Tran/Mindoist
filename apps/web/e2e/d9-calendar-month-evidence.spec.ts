/**
 * D9 — Evidence screenshots: calendar month view layout fixes (tighter day
 * cells, weekday header aligned with day numbers, legend contrast fixed).
 * Captures Calendar month view at 4 breakpoints, both themes.
 */
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/D9-calendar-month';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function uniqueEmail() {
  return `e2e-d9ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('D9 Evidence User');
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

for (const theme of ['light', 'dark'] as const) {
  test(`[D9-EV] ${theme} mode calendar month view at 4 breakpoints`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page);
    await setTheme(page, theme);

    const title = `D9 event ${Date.now()}`;
    await page.keyboard.press('Control+k');
    await page.getByTestId('global-quick-capture-input').fill(title);
    await page.getByTestId('global-quick-capture-submit').click();
    await expect(page.getByTestId('global-quick-capture')).toBeHidden();
    await page.getByRole('button', { name: title, exact: true }).click();
    await expect(page.getByTestId('task-detail')).toBeVisible();
    await page.getByTestId('detail-priority').click();
    await page.getByTestId('detail-priority-1').click();
    await page.getByTestId('detail-deadline-v2').click();
    await page.getByRole('dialog', { name: 'Pick date' }).getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByTestId('detail-save').evaluate((button: HTMLButtonElement) => {
      button.form?.requestSubmit(button);
    });
    await expect(page.getByTestId('task-detail')).not.toBeVisible();

    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.waitForTimeout(400);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('alert')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${EVIDENCE_DIR}/${theme}-month-${viewport.width}.png`, fullPage: true });
    }
    expect(pageErrors).toEqual([]);
  });
}
