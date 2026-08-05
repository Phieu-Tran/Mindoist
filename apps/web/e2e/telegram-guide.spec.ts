import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'laptop', width: 1024, height: 900 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

function uniqueEmail() {
  return `telegram-guide-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Telegram Guide User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

test('Telegram usage guide stays readable at all supported breakpoints', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await page.getByTestId('sidebar-settings').click();
  await page.getByTestId('settings-tab-integrations').click();

  const guide = page.getByTestId('telegram-usage-guide');
  await expect(guide).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to use Mindoist on Telegram' })).toBeVisible();
  await expect(page.getByText('What tasks do I have today?')).toBeVisible();
  await expect(page.getByText(/nothing is saved until you reply confirm/i)).toBeVisible();
  const disclosure = guide.locator('details');
  await guide.locator('summary').click();
  await expect(disclosure).not.toHaveAttribute('open');
  await guide.locator('summary').click();
  await expect(disclosure).toHaveAttribute('open', '');

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => document.fonts.ready);
    await expect(guide).toBeVisible();
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await guide.screenshot({
      path: `../../docs/design/evidence/telegram-usage-guide/${viewport.name}.png`,
      style: '[aria-label^="Sync center"] { visibility: hidden !important; }',
    });
  }

  expect(pageErrors).toEqual([]);
});
