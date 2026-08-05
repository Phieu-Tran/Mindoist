import { test, expect } from '@playwright/test';

test.describe('Task Management E2E', () => {
  function uniqueEmail() {
    return `e2e-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  }

  async function login(page) {
    const email = uniqueEmail();
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await page.locator('input[type="text"]').fill('E2E Task User');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').nth(0).fill('e2e-password');
    await page.locator('input[type="password"]').nth(1).fill('e2e-password');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByTestId('sidebar')).toBeVisible();
  }

  async function addTask(page: any, title: string) {
    await page.getByTestId('add-task-input').fill(title);
    await page.getByTestId('add-task-btn').click();
    // Wait for task to appear in list (by title text)
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  test('[SHELL-01] login shows the four-destination workspace navigation', async ({ page }) => {
    await login(page);

    await expect(page.getByTestId('sidebar-today')).toBeVisible();
    await expect(page.getByTestId('sidebar-all')).toBeVisible();
    await expect(page.getByTestId('sidebar-calendar')).toBeVisible();
    await expect(page.getByTestId('sidebar-projects')).toBeVisible();
    await expect(page.getByTestId('sidebar-inbox')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-next7')).toHaveCount(0);
    await page.getByTestId('sidebar-all').click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByRole('navigation', { name: 'Task views' })).toBeVisible();
    await page.getByRole('button', { name: 'Inbox', exact: true }).click();
    await expect(page).toHaveURL(/\/tasks\/inbox$/);
    await page.getByTestId('sidebar-projects').click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator('#projects-overview-title')).toBeVisible();
    await expect(page.getByTestId('sidebar-projects-toggle')).toBeVisible();
    await expect(page.getByTestId('sidebar-tags-toggle')).toBeVisible();
  });

  test('[TASK-01] loads the empty task workspace from the live API contract', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));

    await login(page);

    // A newly registered user has no tasks. This waits for GET /tasks to complete,
    // proving that the API's array response is accepted by the web hook.
    await expect(page.getByTestId('empty-message')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('[TASK-01] creates a task through the UI and keeps it after the live mutation', async ({ page }) => {
    await login(page);

    const taskTitle = `Test task ${Date.now()}`;
    await addTask(page, taskTitle);
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
  });

  test('[TASK-04] completes a task and reopens it', async ({ page }) => {
    await login(page);

    const taskTitle = `Complete test ${Date.now()}`;
    await addTask(page, taskTitle);

    const titleEl = page.getByText(taskTitle, { exact: true });
    await expect(titleEl).toBeVisible();

    // Find the checkbox in the same task row
    const taskRow = titleEl.locator('xpath=ancestor::div[starts-with(@data-testid,"task-")]');
    const checkbox = taskRow.locator('button[data-testid^="task-toggle-"]');

    // Complete the task
    await checkbox.click();
    await expect(titleEl).toHaveCSS('text-decoration-line', 'line-through');

    // Reopen
    await checkbox.click();
    await expect(titleEl).not.toHaveCSS('text-decoration-line', 'line-through');
  });

  test('complete task can be undone from the toast', async ({ page }) => {
    await login(page);

    const taskTitle = `Undo complete ${Date.now()}`;
    await addTask(page, taskTitle);

    const titleEl = page.getByTestId('task-list').getByText(taskTitle, { exact: true });
    const taskRow = titleEl.locator('xpath=ancestor::div[starts-with(@data-testid,"task-")]');
    const checkbox = taskRow.locator('button[data-testid^="task-toggle-"]');

    await checkbox.click();
    await expect(titleEl).toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.getByTestId('undo-toast')).toContainText('Completed');

    await page.getByTestId('undo-toast-action').click();
    await expect(titleEl).not.toHaveCSS('text-decoration-line', 'line-through');
  });

  test('bulk select completes visible tasks and can be undone', async ({ page }) => {
    await login(page);

    const taskOne = `Bulk one ${Date.now()}`;
    const taskTwo = `Bulk two ${Date.now()}`;
    await addTask(page, taskOne);
    await addTask(page, taskTwo);

    const rowOne = page.getByTestId('task-list').getByText(taskOne, { exact: true }).locator('xpath=ancestor::div[starts-with(@data-testid,"task-") and @data-testid!="task-list"][1]');
    await rowOne.hover();
    await rowOne.locator('[data-testid^="task-select-"]').click();
    await page.getByTestId('bulk-select-visible').click();
    await expect(page.getByTestId('bulk-selected-count')).toContainText('2 selected');

    await page.getByTestId('bulk-complete').click();
    const titleOne = page.getByTestId('task-list').getByText(taskOne, { exact: true });
    const titleTwo = page.getByTestId('task-list').getByText(taskTwo, { exact: true });
    await expect(titleOne).toHaveCSS('text-decoration-line', 'line-through');
    await expect(titleTwo).toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.getByTestId('undo-toast')).toContainText('Completed 2 tasks');

    await page.getByTestId('undo-toast-action').click();
    await expect(titleOne).not.toHaveCSS('text-decoration-line', 'line-through');
    await expect(titleTwo).not.toHaveCSS('text-decoration-line', 'line-through');
  });

  test('deleted task can be restored from the toast', async ({ page }) => {
    await login(page);

    const taskTitle = `Undo delete ${Date.now()}`;
    await addTask(page, taskTitle);

    const listTitle = page.getByTestId('task-list').getByText(taskTitle, { exact: true });
    await listTitle.click();
    await expect(page.getByTestId('task-detail')).toBeVisible();

    await page.getByTestId('task-detail').getByRole('button', { name: 'More actions' }).click();
    await page.getByTestId('task-detail').getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByTestId('detail-delete-confirm').click();
    await expect(listTitle).not.toBeVisible();
    await expect(page.getByTestId('undo-toast')).toContainText('Deleted');

    await page.getByTestId('undo-toast-action').click();
    await expect(page.getByTestId('task-list').getByText(taskTitle, { exact: true })).toBeVisible();
  });

  test('[TASK-02] quick add with natural language shows preview metadata', async ({ page }) => {
    await login(page);

    const input = page.getByTestId('add-task-input');
    await input.fill('buy milk tomorrow 9am p1');

    // Preview chips should appear
    await expect(page.getByTestId('quick-add-preview')).toBeVisible();
    await expect(page.getByTestId('preview-due-date')).toBeVisible();
    await expect(page.getByTestId('preview-due-time')).toBeVisible();
    await expect(page.getByTestId('preview-priority')).toBeVisible();
  });

  test('[TASK-02] quick add with Enter creates task via parsed payload', async ({ page }) => {
    await login(page);

    const input = page.getByTestId('add-task-input');
    await input.fill('pay rent tomorrow 10am');
    await expect(page.getByTestId('preview-due-date')).toBeVisible();

    await input.press('Enter');

    // A future task belongs in Upcoming, with the parsed date/time removed from its title.
    await page.goto('/tasks/upcoming');
    await expect(page.getByText('pay rent', { exact: true })).toBeVisible();
  });

  test('[DETAIL-01] opens task detail, edits its title, and updates the workspace', async ({ page }) => {
    await login(page);

    const originalTitle = `Detail test ${Date.now()}`;
    await addTask(page, originalTitle);

    const titleEl = page.getByText(originalTitle, { exact: true });
    await expect(titleEl).toBeVisible();

    // Click to open detail panel
    await titleEl.click();
    await expect(page.getByTestId('task-detail')).toBeVisible();
    await expect(page.getByTestId('detail-title')).toHaveValue(originalTitle);

    // Edit title
    const newTitle = `Updated ${originalTitle}`;
    await page.getByTestId('detail-title').fill(newTitle);
    await page.getByTestId('detail-save').click();

    // Detail panel closes after save
    await expect(page.getByTestId('task-detail')).not.toBeVisible();

    // List updates with new title
    await expect(page.getByText(newTitle, { exact: true })).toBeVisible();
  });
});
