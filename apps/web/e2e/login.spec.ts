import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

test.describe('Login Flow E2E', () => {
  test('[AUTH-01] registers, returns to My Day, logs in, and keeps the real test-db session', async ({ page }, testInfo) => {
    const email = `e2e-${Date.now()}-${testInfo.workerIndex}@example.test`;
    const password = 'e2e-password';
    const name = 'E2E User';

    await page.goto('/login');
    await page.getByRole('button', { name: 'Register', exact: true }).click();

    await page.locator('input[type="text"]').fill(name);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').nth(0).fill(password);
    await page.locator('input[type="password"]').nth(1).fill(password);
    await page.getByRole('button', { name: 'Register', exact: true }).click();

    // After login, sidebar should be visible
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page).toHaveURL(/\/today$/);

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page).toHaveURL(/\/today$/);
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page).toHaveURL(/\/today$/);
  });

  test('should show login form on app load', async ({ page }) => {
    await page.goto('/login');

    // Verify login form elements are visible
    const loginTitle = page.getByRole('heading', { name: 'Login' });
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.getByRole('button', { name: 'Login' });

    await expect(loginTitle).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(loginButton).toBeVisible();
  });

  test('[AUTH-03] navigates between login and register without losing keyboard-addressable form controls', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();

    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });

  test('[AUTH-02] rejects invalid email format', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('invalid-email');
    await page.getByTestId('login-submit').click();

    await expect(page.locator('#login-email-error')).toBeVisible();
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    await expect(emailInput).toBeFocused();
  });

  test('[AUTH-02] reports missing required fields', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('login-submit').click();
    const emailInput = page.locator('input[type="email"]');
    await expect(page.locator('#login-email-error')).toBeVisible();
    await expect(page.locator('#login-password-error')).toBeVisible();
    await expect(emailInput).toBeFocused();
  });

  test('[AUTH-03] captures real responsive login and register forms with touch-safe controls', async ({ page }) => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    for (const viewport of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/login');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.getByTestId('login-email').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `${EVIDENCE_DIR}/login-${viewport.width}.png`, fullPage: true });

      await page.getByRole('button', { name: 'Register', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
      await expect(page.getByTestId('login-form')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const testId of ['register-name', 'register-email', 'register-password', 'register-confirm']) {
        await expect(page.getByTestId(testId)).toBeVisible();
        expect(await page.getByTestId(testId).evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
      await expect.poll(() => page.getByTestId('register-form').evaluate(element => {
        let current: Element | null = element;
        while (current && current !== document.body) {
          if (Number.parseFloat(getComputedStyle(current).opacity) < 0.99) return false;
          current = current.parentElement;
        }
        return true;
      })).toBe(true);
      await page.screenshot({ path: `${EVIDENCE_DIR}/register-${viewport.width}.png`, fullPage: true });
    }
  });
});
