/**
 * D2 — Evidence screenshots: surface layering (canvas → sidebar → card).
 * Captures Inbox with the Task Detail panel open (inspector = the clearest
 * `bg-card` panel) at 375/768/1024/1440, both themes. Theme verified via the
 * root element class before every screenshot (B1.11 lesson).
 */
import { test, expect, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/D2-surface-layering';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function uniqueEmail() {
  return `e2e-d2ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('D2 Evidence User');
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
  const title = `Review layout tokens ${Date.now()}`;
  await page.keyboard.press('Control+k');
  await page.getByTestId('global-quick-capture-input').fill(title);
  await page.getByTestId('global-quick-capture-submit').click();
  await expect(page.getByTestId('global-quick-capture')).toBeHidden();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: title, exact: true }).click();
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
      path: `${EVIDENCE_DIR}/${theme}-panel-${viewport.width}.png`,
      fullPage: true,
    });
  }
}

test('[D2-EV] light mode surface layering evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'light');
  const title = await arrangeScene(page);
  await captureAcrossViewports(page, 'light', title);
  expect(pageErrors).toEqual([]);
});

test('[D2-EV] dark mode surface layering evidence at 4 breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await setTheme(page, 'dark');
  const title = await arrangeScene(page);
  await captureAcrossViewports(page, 'dark', title);
  expect(pageErrors).toEqual([]);
});
