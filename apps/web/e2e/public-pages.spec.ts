import { expect, test } from '@playwright/test';

test.describe('Public product and legal pages', () => {
  test('homepage introduces Mindoist and exposes verification links without authentication', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Mindoist' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Plan what matters/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /View source on GitHub/i })).toHaveAttribute(
      'href',
      'https://github.com/Phieu-Tran/Mindoist',
    );
    await expect(page.getByRole('link', { name: 'Log in' }).first()).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: 'Privacy' }).first()).toHaveAttribute('href', '/privacy');
    await expect(page.getByText(/Google-origin events remain a read-only overlay/i)).toBeVisible();
  });

  test('privacy and terms are directly available and describe Google Calendar boundaries', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText(/Google-origin events are read-only inside Mindoist/i)).toBeVisible();

    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Google and third-party integrations/i })).toBeVisible();
  });

  test('public pages fit a narrow mobile viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    for (const path of ['/', '/privacy', '/terms']) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    }
  });
});
