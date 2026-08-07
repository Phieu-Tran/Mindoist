/**
 * D7 — Evidence screenshots: QuickAdd as a quiet row (was bordered input +
 * bold square button), sidebar footer with one control idiom (was 5), and
 * Settings without the duplicate Logout. Captures Inbox (QuickAdd + sidebar
 * footer) and Settings at 4 breakpoints, both themes.
 */
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/D7-quickadd-sidebar-settings';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function uniqueEmail() {
  return `e2e-d7ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('D7 Evidence User');
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

async function captureView(page: Page, theme: 'light' | 'dark', name: string) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${EVIDENCE_DIR}/${theme}-${name}-${viewport.width}.png`, fullPage: true });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`[D7-EV] ${theme} mode inbox (QuickAdd + sidebar footer) at 4 breakpoints`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page);
    await setTheme(page, theme);
    await captureView(page, theme, 'inbox');
    expect(pageErrors).toEqual([]);
  });

  test(`[D7-EV] ${theme} mode settings panel at 4 breakpoints`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page);
    await setTheme(page, theme);
    await page.getByTestId('sidebar-settings').click();
    await expect(page.getByTestId('settings-panel-account')).toBeVisible();
    await captureView(page, theme, 'settings');
    expect(pageErrors).toEqual([]);
  });
}
