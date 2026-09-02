import { test, expect } from '@playwright/test';

test.describe('T6: Search & Completed History E2E', () => {
  function uniqueEmail() {
    return `e2e-t6-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  }

  async function register(page: any) {
    const email = uniqueEmail();
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await page.locator('input[type="text"]').fill('T6 E2E User');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').nth(0).fill('e2e-password');
    await page.locator('input[type="password"]').nth(1).fill('e2e-password');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByTestId('sidebar')).toBeVisible();
  }

  async function addTask(page: any, title: string) {
    await page.keyboard.press('Control+k');
    await page.getByTestId('global-quick-capture-input').fill(title);
    await page.getByTestId('global-quick-capture-submit').click();
    await expect(page.getByTestId('global-quick-capture')).toBeHidden();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  test('[TASK-04] complete, view in Completed, reopen, verify in Inbox', async ({ page }) => {
    await register(page);
    await addTask(page, 'File tax receipt');

    // Complete the task via checkbox
    const taskRow = page.getByText('File tax receipt', { exact: true }).locator('xpath=ancestor::div[starts-with(@data-testid,"task-")]');
    const checkbox = taskRow.locator('button[data-testid^="task-toggle-"]');
    await checkbox.click();

    // Task gets strikethrough
    await expect(page.getByText('File tax receipt', { exact: true })).toHaveCSS('text-decoration-line', 'line-through', { timeout: 15_000 });

    // Reload — task not in inbox as open
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Navigate to Completed view
    await page.goto('/history/completed');
    await expect(page.getByText('File tax receipt', { exact: true })).toBeVisible();

    // Reopen from completed view
    const completedRow = page.getByText('File tax receipt', { exact: true }).locator('xpath=ancestor::div[starts-with(@data-testid,"task-")]');
    const completedCheckbox = completedRow.locator('button[data-testid^="task-toggle-"]');
    await completedCheckbox.click();

    // Reopening removes the task from the Completed result immediately.
    await expect(page.getByText('File tax receipt', { exact: true })).not.toBeVisible();

    // Navigate away then back to Completed — task should be gone (API refetch)
    await page.goto('/tasks/inbox');
    await page.goto('/history/completed');
    await expect(page.getByText('File tax receipt', { exact: true })).not.toBeVisible();

    // Navigate to Inbox — task should be there as open
    await page.goto('/tasks/inbox');
    await expect(page.getByText('File tax receipt', { exact: true })).toBeVisible();

    // Reload — persistence
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByText('File tax receipt', { exact: true })).toBeVisible();

    // Verify checkbox is unchecked
    const inboxRow = page.getByText('File tax receipt', { exact: true }).locator('xpath=ancestor::div[starts-with(@data-testid,"task-")]');
    const inboxCheckbox = inboxRow.locator('button[data-testid^="task-toggle-"]');
    await expect(inboxCheckbox).toHaveAttribute('data-state', 'unchecked');
  });

  test('[TASK-03] My Day groups an overdue task', async ({ page }) => {
    await register(page);

    // Seed an overdue task via API (yesterday's due date)
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    await page.evaluate(async ({ date, token }) => {
      const res = await fetch('/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: 'Overdue expense report',
          deadline: {
            date,
            time: '17:00',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          },
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
    }, { date: yesterdayStr, token });

    // My Day contains the overdue group in the Direction-B IA.
    await page.goto('/today');
    await expect(page.getByTestId('task-list')).toBeVisible();
    await expect(page.getByText('Overdue expense report', { exact: true })).toBeVisible();
  });
});
