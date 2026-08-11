import { test, expect, Page } from '@playwright/test';

// B1.15 — Task Detail UX overhaul: side panel layout, custom date picker
// with date ranges (startDate → dueDate), and sub-task management.
test.describe('B1.15 Task Detail UX', () => {
  function uniqueEmail() {
    return `e2e-b115-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  }

  async function login(page: Page) {
    const email = uniqueEmail();
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await page.locator('input[type="text"]').fill('E2E B115 User');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').nth(0).fill('e2e-password');
    await page.locator('input[type="password"]').nth(1).fill('e2e-password');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByTestId('sidebar')).toBeVisible();
  }

  async function addTask(page: Page, title: string) {
    await page.getByTestId('add-task-input').fill(title);
    await page.getByTestId('add-task-btn').click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  async function openDetail(page: Page, title: string) {
    await page.getByText(title, { exact: true }).click();
    await expect(page.getByTestId('task-detail')).toBeVisible();
  }

  async function pickDeadline(page: Page, due: Date) {
    await page.getByTestId('detail-deadline-v2').click();
    const popup = page.getByRole('dialog', { name: 'Pick date' });
    await expect(popup).toBeVisible();

    const dueMonthLabel = due.toLocaleString('en', { month: 'long', year: 'numeric' });
    for (let i = 0; i < 12; i++) {
      if (await popup.getByText(dueMonthLabel, { exact: true }).isVisible()) break;
      await popup.getByRole('button', { name: 'Next month' }).click();
    }
    await popup.getByRole('button', { name: String(due.getDate()), exact: true }).click();
    await expect(popup).not.toBeVisible();
  }

  test('[DETAIL-02] task detail opens beside the list on desktop, not below it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    const title = `Side panel ${Date.now()}`;
    await addTask(page, title);
    await openDetail(page, title);

    const listBox = await page.getByTestId('task-list').boundingBox();
    const detailBox = await page.getByTestId('task-detail').boundingBox();
    expect(listBox).toBeTruthy();
    expect(detailBox).toBeTruthy();

    // Same horizontal band: the panel's vertical range overlaps the list's.
    expect(detailBox!.y).toBeLessThan(listBox!.y + listBox!.height);
    expect(detailBox!.y + detailBox!.height).toBeGreaterThan(listBox!.y);
    // And it sits to the RIGHT of the list, not stacked below it.
    expect(detailBox!.x).toBeGreaterThanOrEqual(listBox!.x + listBox!.width - 8);
  });

  test('[DETAIL-01] creates, completes, and persists a sub-task from the detail panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    const parentTitle = `Parent ${Date.now()}`;
    await addTask(page, parentTitle);

    // Grab the parent task id for the list indicator assertion.
    const titleTestId = await page.getByText(parentTitle, { exact: true }).getAttribute('data-testid');
    const parentId = titleTestId!.replace('task-title-', '');

    await openDetail(page, parentTitle);

    // Add a sub-task with Enter — it must appear in the sub-task list.
    const subTitle = `Child ${Date.now()}`;
    await page.getByTestId('subtask-input').fill(subTitle);
    await page.getByTestId('subtask-input').press('Enter');
    await expect(page.getByText(subTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('subtask-input')).toHaveValue('');

    // The parent row in the list now shows the sub-task indicator (0/1).
    await expect(page.getByTestId(`task-subtasks-${parentId}`)).toContainText('0/1');

    // Complete the sub-task via its checkbox inside the detail panel.
    const subtaskRow = page.locator('[data-testid="detail-subtasks"] [data-testid^="subtask-"]').first();
    await subtaskRow.locator('button[role="checkbox"]').click();
    await expect(subtaskRow.locator('button[role="checkbox"]')).toHaveAttribute('data-state', 'checked');
    await expect(page.getByTestId(`task-subtasks-${parentId}`)).toContainText('1/1');

    // Persistence proof: reload, reopen the parent, sub-task is still there and done.
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await openDetail(page, parentTitle);
    const reloadedRow = page.locator('[data-testid="detail-subtasks"] [data-testid^="subtask-"]').first();
    await expect(reloadedRow).toContainText(subTitle);
    await expect(reloadedRow.locator('button[role="checkbox"]')).toHaveAttribute('data-state', 'checked');
  });

  test('[DETAIL-01] persists a deadline to Task List and Calendar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    const title = `Range ${Date.now()}`;
    await addTask(page, title);
    await openDetail(page, title);

    const due = new Date();
    due.setDate(due.getDate() + 3);

    await pickDeadline(page, due);
    await page.getByTestId('detail-save').click();
    await expect(page.getByTestId('task-detail')).not.toBeVisible();

    // Persistence + calendar: the task renders as an event on the calendar.
    await page.getByTestId('sidebar-calendar').click();
    await expect(page.locator('.fc')).toBeVisible();
    await expect(page.locator('.fc').getByText(title).first()).toBeVisible();

    // Reload through All: a scheduled task is deliberately not in the new
    // untriaged Inbox, while All remains the persistent complete task list.
    await page.getByTestId('sidebar-all').click();
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  });
});
