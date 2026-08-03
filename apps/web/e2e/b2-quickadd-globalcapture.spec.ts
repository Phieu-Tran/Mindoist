/**
 * B2.21 (Quick Add advanced parsing) + B2.26 (global quick-capture console).
 * Verifies end-to-end that: (1) Cmd/Ctrl+K opens the capture console from a
 * view where the regular Quick Add input isn't even mounted (Calendar), and
 * (2) a parsed duration + reminder offset actually persist on the created
 * task — not just get parsed and displayed, then silently dropped (the real
 * pre-existing gap this round of fixes closed).
 */
import { test, expect, type Page } from '@playwright/test';

function uniqueEmail() {
  return `e2e-b2-qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('B2 QuickAdd User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

test('global quick capture opens from Calendar view (no Quick Add mounted there) and creates a task with duration', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);

  await page.getByTestId('sidebar-calendar').click();
  await expect(page.getByTestId('quick-add')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('global-quick-capture')).toBeVisible();
  await page.getByTestId('global-quick-capture-input').fill('deep work session 90m');
  await page.getByTestId('global-quick-capture-submit').click();
  await expect(page.getByTestId('global-quick-capture')).not.toBeVisible();

  await page.goto('/tasks');
  await page.getByText('deep work session', { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await expect(page.getByTestId('detail-duration-min')).toHaveValue('90');
});

test('quick add reminder phrase persists as a real reminder on the created task', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);

  await page.getByTestId('add-task-input').fill('call dentist remind me 15m before');
  await page.getByTestId('preview-reminder').waitFor();
  await page.getByTestId('add-task-btn').click();
  await expect(page.getByText('call dentist', { exact: true })).toBeVisible();

  await page.getByText('call dentist', { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await expect(page.getByTestId('detail-reminders')).not.toHaveText('Reminders');

  // Reload to prove the reminder was actually persisted server-side, not
  // just held in local component state.
  await page.reload();
  await page.getByText('call dentist', { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await expect(page.getByTestId('detail-reminders')).not.toHaveText('Reminders');
});
