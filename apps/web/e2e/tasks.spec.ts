import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const DISCOVERABILITY_EVIDENCE_DIR = '../../docs/design/evidence/discoverability';

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
    await page.keyboard.press('Control+k');
    await page.getByTestId('global-quick-capture-input').fill(title);
    await page.getByTestId('global-quick-capture-submit').click();
    await expect(page.getByTestId('global-quick-capture')).toBeHidden();
    // Wait for task to appear in list (by title text)
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  test('[SHELL-01] login shows the five-destination workspace navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    await expect(page.getByTestId('sidebar-today')).toBeVisible();
    await expect(page.getByTestId('sidebar-calendar')).toBeVisible();
    await expect(page.getByTestId('sidebar-countdown')).toBeVisible();
    await expect(page.getByTestId('sidebar-projects')).toBeVisible();
    await expect(page.getByTestId('sidebar-summary')).toBeVisible();
    await expect(page.getByTestId('sidebar-inbox')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-next7')).toHaveCount(0);
    await page.getByTestId('sidebar-countdown').click();
    await expect(page).toHaveURL(/\/countdown$/);
    await expect(page.getByRole('button', { name: 'Add countdown' })).toBeVisible();
    mkdirSync(DISCOVERABILITY_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: `${DISCOVERABILITY_EVIDENCE_DIR}/countdown-entry-1440.png`, fullPage: true });
    await page.getByTestId('sidebar-summary').click();
    await expect(page).toHaveURL(/\/review(?:\?.*)?$/);
    await expect(page.getByTestId('review-tabs')).toBeVisible();
    await page.getByTestId('sidebar-projects').click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator('#projects-overview-title')).toBeVisible();
    await expect(page.getByTestId('sidebar-projects-toggle')).toBeVisible();
    await expect(page.getByTestId('sidebar-settings')).toBeVisible();
  });

  test('[SHELL-02] creates and reloads a real tag view from the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    await page.getByTestId('sidebar-add-task').click();
    await expect(page.getByTestId('global-quick-capture')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('global-quick-capture')).toBeHidden();

    const tagName = `sidebar-${Date.now()}`;
    await page.getByTestId('sidebar-add-tag').click();
    await page.getByLabel('Tag name').fill(tagName);
    await page.getByLabel('Tag name').press('Enter');

    await expect(page).toHaveURL(/\/tags\/[^/]+$/);
    await expect(page.getByRole('heading', { name: `#${tagName}`, exact: true }).first()).toBeVisible();
    await expect(page.getByText('No tasks with this tag')).toBeVisible();
    await expect(page.getByRole('button', { name: `#${tagName}`, exact: true })).toHaveAttribute('aria-current', 'page');

    await page.reload();
    await expect(page).toHaveURL(/\/tags\/[^/]+$/);
    await expect(page.getByRole('heading', { name: `#${tagName}`, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: `#${tagName}`, exact: true })).toHaveAttribute('aria-current', 'page');
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

    // Reopen from the dedicated Completed history surface. Completed tasks
    // may leave the active work list as soon as the mutation is reconciled.
    await page.goto('/history/completed');
    const completedTitle = page.getByText(taskTitle, { exact: true });
    const completedRow = completedTitle.locator('xpath=ancestor::div[starts-with(@data-testid,"task-")]');
    await completedRow.locator('button[data-testid^="task-toggle-"]').click();
    await expect(completedTitle).not.toBeVisible();
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

  test('keyboard x and Shift+J operate the visible bulk selection', async ({ page }) => {
    await login(page);

    await addTask(page, `Keyboard one ${Date.now()}`);
    await addTask(page, `Keyboard two ${Date.now()}`);
    await addTask(page, `Keyboard three ${Date.now()}`);
    await expect(page.getByTestId('task-list').getByTestId(/^task-title-/)).toHaveCount(3);

    await page.keyboard.press('j');
    await page.keyboard.press('x');
    await expect(page.getByTestId('bulk-selected-count')).toContainText('1 selected');

    await page.keyboard.press('Shift+J');
    await expect(page.getByTestId('bulk-selected-count')).toContainText('2 selected');

    await page.keyboard.press('x');
    await expect(page.getByTestId('bulk-selected-count')).toContainText('1 selected');
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

    await page.keyboard.press('Control+k');
    const input = page.getByTestId('global-quick-capture-input');
    await input.fill('buy milk tomorrow 9am p1');

    // Preview chips should appear
    await expect(page.getByTestId('command-preview')).toBeVisible();
    await expect(page.getByTestId('quick-add-date')).toBeVisible();
    await expect(page.getByTestId('quick-add-time')).toBeVisible();
    await expect(page.getByTestId('quick-add-priority')).toBeVisible();
  });

  test('[TASK-02] quick add with Enter creates task via parsed payload', async ({ page }) => {
    await login(page);

    await page.keyboard.press('Control+k');
    const input = page.getByTestId('global-quick-capture-input');
    await input.fill('pay rent tomorrow 10am');
    await expect(page.getByTestId('quick-add-date')).toBeVisible();

    await page.getByTestId('global-quick-capture-submit').click();
    await expect(page.getByTestId('global-quick-capture')).toBeHidden();

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

  test('[DETAIL-02] creates and assigns a tag from task details', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    const title = `Tagged task ${Date.now()}`;
    await addTask(page, title);
    await page.getByText(title, { exact: true }).click();
    await expect(page.getByTestId('task-detail')).toBeVisible();

    await page.getByTestId('detail-tags').click();
    await page.getByLabel('Tag name').fill('Deep work');
    await page.getByTestId('task-property-registry').getByRole('button', { name: 'Add tag' }).click();

    await expect(page.getByTestId('detail-tags')).toContainText('Deep work');
    mkdirSync(DISCOVERABILITY_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: `${DISCOVERABILITY_EVIDENCE_DIR}/tag-create-1440.png`, fullPage: true });
  });
});
