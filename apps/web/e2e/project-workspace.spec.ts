import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

function uniqueEmail() {
  return `e2e-workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('accent', 'jade');
    localStorage.setItem('theme', 'dark');
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Workspace E2E User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function createJobProject(page: Page, name: string) {
  await page.getByTestId('sidebar-add-project').click();
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: /Job Search/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('[PROJECTS-01] project workspace defaults to List, persists Board opt-in, and filters root task cards', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  const projectName = `Launch Desk ${Date.now()}`;
  await createJobProject(page, projectName);
  await expect(page.getByTestId('project-list')).toBeVisible();
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(page.getByTestId('project-board')).toBeVisible();

  await page.getByTestId('add-task-input').fill('Portfolio review tomorrow p2');
  await page.getByTestId('add-task-btn').click();
  await expect(page.getByText('Portfolio review', { exact: true })).toBeVisible();

  // Move task to Interview from the compact card actions menu
  const interviewColumn = page.locator('.project-column').filter({ hasText: 'Interview' });
  const interviewColumnId = (await interviewColumn.getAttribute('data-testid'))?.replace('project-column-', '');
  await page.getByRole('button', { name: 'Move Portfolio review to another column' }).click();
  const moveResponse = page.waitForResponse(response =>
    response.request().method() === 'PATCH' && response.url().endsWith('/move'),
  );
  await page.getByRole('menuitem', { name: 'Interview' }).click();
  const response = await moveResponse;
  await expect(response.ok()).toBe(true);
  const movedTaskResponse = await response.json() as { data: { projectColumnId: string } };
  expect(movedTaskResponse.data.projectColumnId).toBe(interviewColumnId);
  await expect(
    interviewColumn.filter({ hasText: 'Portfolio review' }),
  ).toBeVisible();

  // Add a third column with Rose color using custom combobox
  await page.getByRole('button', { name: 'Add column', exact: true }).first().click();
  await page.getByLabel('New column').fill('Review');
  // The color Select has no aria-label; open it by role=combobox within the form
  const colorCombobox = page.locator('form').getByRole('combobox');
  await colorCombobox.click();
  await page.getByRole('option', { name: 'Rose' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();

  // Take screenshots at multiple breakpoints
  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('project-board')).toBeVisible();
    await expect(page.getByText('Portfolio review', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(pageErrors).toEqual([]);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/project-board-${viewport.width}.png`,
      fullPage: true,
    });
  }

  // Column drag-and-drop reorder
  await page.setViewportSize({ width: 1440, height: 900 });
  const columns = page.locator('.project-column');
  const firstColumn = columns.nth(0);
  const secondColumn = columns.nth(1);
  const firstColumnId = await firstColumn.getAttribute('data-testid');
  const secondColumnId = await secondColumn.getAttribute('data-testid');
  expect(firstColumnId).toBeTruthy();
  expect(secondColumnId).toBeTruthy();

  // Record initial order
  const firstTitle = await firstColumn.locator('h3').textContent();
  const secondTitle = await secondColumn.locator('h3').textContent();

  // Perform drag from first column header handle to second column
  const firstHandle = page.getByTestId(`project-column-drag-handle-${firstColumnId!.replace('project-column-', '')}`);
  const secondHandle = page.getByTestId(`project-column-drag-handle-${secondColumnId!.replace('project-column-', '')}`);
  await expect(firstHandle).toBeVisible();
  await expect(secondHandle).toBeVisible();

  // Use Playwright dragTo
  await firstHandle.dragTo(secondHandle);
  await page.waitForTimeout(500);

  // Verify order changed
  const newFirstTitle = await columns.nth(0).locator('h3').textContent();
  expect(newFirstTitle).toBe(secondTitle);

  // Verify persistence: reload and re-navigate to project
  await page.reload();
  await page.locator('[data-testid^="sidebar-project-"]').filter({ hasText: projectName }).first().click();
  await expect(page.locator('#project-workspace-title')).toHaveText(projectName);
  const reloadedFirstTitle = await columns.nth(0).locator('h3').textContent();
  expect(reloadedFirstTitle).toBe(secondTitle);

  // List view
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByTestId('project-list')).toBeVisible();
  await expect(page.getByText('Portfolio review', { exact: true })).toBeVisible();

  // Sub-project
  await page.locator('[data-testid^="sidebar-add-subproject-"]').first().click();
  const subProjectName = `Practice Loop ${Date.now()}`;
  await page.getByLabel('Project name').fill(subProjectName);
  await page.getByRole('button', { name: /Personal/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('#project-workspace-title')).toHaveText(subProjectName);

  await page.getByTestId('add-task-input').fill('Mock interview today p1');
  await page.getByTestId('add-task-btn').click();
  await expect(page.getByText('Mock interview', { exact: true })).toBeVisible();

  await page.locator('[data-testid^="sidebar-project-"]').filter({ hasText: projectName }).first().click();
  await expect(page.locator('#project-workspace-title')).toHaveText(projectName);
  await expect(page.getByText('Mock interview', { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('[PROJECTS-02] Calendar sync is selected and persisted per project', async ({ page }) => {
  await register(page);
  const projectName = `Calendar Scope ${Date.now()}`;
  await createJobProject(page, projectName);

  const syncButton = page.getByTestId('project-calendar-sync');
  await expect(syncButton).toHaveAttribute('aria-pressed', 'false');
  const updateResponse = page.waitForResponse(response =>
    response.request().method() === 'PATCH'
      && /\/projects\/[^/]+$/.test(new URL(response.url()).pathname),
  );
  await syncButton.click();
  await expect((await updateResponse).ok()).toBe(true);
  await expect(syncButton).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.locator('[data-testid^="sidebar-project-"]').filter({ hasText: projectName }).first().click();
  await expect(page.getByTestId('project-calendar-sync')).toHaveAttribute('aria-pressed', 'true');
});
