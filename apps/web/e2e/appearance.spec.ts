import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/accent-personalization';

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Appearance E2E User');
  await page.locator('input[type="email"]').fill(
    `e2e-appearance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
  );
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

test('[appearance] accent and dark mode persist across reload and remain responsive', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  await page.keyboard.press('Control+k');
  await page.getByTestId('global-quick-capture-input').fill('Kiểm tra bảng màu tiếng Việt');
  await page.getByTestId('global-quick-capture-submit').click();
  await expect(page.getByTestId('global-quick-capture')).toBeHidden();
  await expect(page.getByText('Kiểm tra bảng màu tiếng Việt', { exact: true })).toBeVisible();

  await page.getByTestId('accent-picker-trigger').click();
  await page.getByRole('radio', { name: 'Jade' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'jade');
  expect(await page.evaluate(() => localStorage.getItem('accent'))).toBe('jade');
  expect(await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
  )).toBe('oklch(48.55% .115 171.82)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'jade');
  await expect(page.getByTestId('accent-picker-trigger')).toHaveAccessibleName(/Jade/);

  // The toggle flips the *resolved* light/dark state on every click (fixed
  // bug: it used to cycle through a hidden 'system' step that could resolve
  // to the same appearance as the state just left, making a click look like
  // a no-op). One click always changes what's on screen — but the browser's
  // starting OS preference isn't fixed, so click at most twice here to land
  // on dark regardless of where it started.
  const themeToggle = page.getByTestId('theme-toggle');
  const html = page.locator('html');
  await themeToggle.click();
  if (!(await html.evaluate(el => el.classList.contains('dark')))) {
    await themeToggle.click();
  }
  await expect(html).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

  await page.getByTestId('accent-picker-trigger').click();
  await expect(page.getByRole('dialog', { name: 'Choose an accent color' })).toBeVisible();
  await page.waitForTimeout(200);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE_DIR}/jade-dark-desktop.png`, fullPage: true });

  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId('sidebar')).not.toBeVisible();
  await page.getByTestId('menu-toggle').click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
  await page.getByTestId('accent-picker-trigger').click();
  await expect(page.getByRole('dialog', { name: 'Choose an accent color' })).toBeVisible();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE_DIR}/jade-dark-mobile-375.png`, fullPage: true });
});
