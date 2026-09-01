import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

function uniqueEmail() {
  return `e2e-timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

// The view switcher is a dropdown (Akiflow-style day counts), so picking a
// view means opening the combobox and choosing an option.
async function selectView(page: Page, label: string) {
  await page.getByTestId('calendar-view-switch').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function expectView(page: Page, label: string) {
  await expect(page.getByTestId('calendar-view-switch')).toHaveText(label);
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Timeline E2E User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function addTask(page: Page, value: string, title: string) {
  await page.keyboard.press('Control+k');
  await page.getByTestId('global-quick-capture-input').fill(value);
  await page.getByTestId('global-quick-capture-submit').click();
  await expect(page.getByTestId('global-quick-capture')).toBeHidden();
  await expect(page.locator('[data-testid^="task-title-"]').filter({ hasText: title }).first()).toBeVisible();
}

async function dragCalendarEventTo(page: Page, title: string, targetTime: string) {
  const event = page.locator('.mindoist-time-grid-block').filter({ hasText: title }).first();
  await expect(event).toBeVisible();
  const targetGrid = event.locator('xpath=ancestor::*[contains(@class, "mindoist-time-grid")]');
  const box = await targetGrid.boundingBox();
  if (!box) throw new Error('Calendar time grid has no bounding box');
  const [hour, minute] = targetTime.split(':').map(Number);
  const y = ((hour * 60 + minute - 6 * 60) / (17 * 60)) * box.height;
  await event.dragTo(targetGrid, { force: true, targetPosition: { x: box.width / 2, y } });
  await page.waitForTimeout(350);
}

test('[CALENDAR-01] week/day timeline deep link is time-based, persistent, and responsive', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  await addTask(page, 'Design review today 10am p1', 'Design review');
  await addTask(page, 'Write notes today 2pm p3', 'Write notes');
  await page.goto('/calendar?view=week&plan=0');

  await selectView(page, '7 days');
  await expect(page.locator('.mindoist-calendar-grid')).toBeVisible();
  await expect(page.locator('.mindoist-deadline-marker').filter({ hasText: 'Design review' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mindoist:calendar:view'))).toBe('timeGridWeek');

  await selectView(page, '1 day');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mindoist:calendar:view'))).toBe('timeGridDay');
  await page.reload();
  await expectView(page, '1 day');

  const viewports = [
    { width: 375, height: 812, view: '1 day' },
    { width: 768, height: 1024, view: '7 days' },
    { width: 1024, height: 768, view: '7 days' },
    { width: 1440, height: 900, view: '7 days' },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await selectView(page, viewport.view);
    await page.waitForTimeout(250);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.mindoist-calendar-grid')).toBeVisible();
    await expect(page.locator('.mindoist-deadline-marker').filter({ hasText: 'Design review' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(pageErrors).toEqual([]);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/calendar-timeline-${viewport.width}.png`,
      fullPage: true,
    });
  }
});

test('[CALENDAR-02] dragging a calendar task updates and persists its scheduled time', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await addTask(page, 'Drag schedule p2', 'Drag schedule');
  const taskTestId = await page
    .getByTestId(/^task-[0-9a-f-]{36}$/)
    .filter({ hasText: 'Drag schedule' })
    .getAttribute('data-testid');
  const taskId = taskTestId?.replace(/^task-/, '');
  if (!taskId) throw new Error('Created task id was not rendered');
  const planned = await page.evaluate(() => {
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const prefix = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return { start: `${prefix}T10:00`, end: `${prefix}T11:00` };
  });
  const created = await page.evaluate(async ({ taskId, planned }) => {
    const token = localStorage.getItem('token');
    const response = await fetch('/time-blocks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        startAt: new Date(planned.start).toISOString(),
        endAt: new Date(planned.end).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        allDay: false,
        source: 'MANUAL',
      }),
    });
    return response.json();
  }, { taskId, planned });
  expect(created.success).toBe(true);
  await page.goto('/calendar?view=week&plan=0');
  const scheduledEvent = page.locator('.mindoist-time-grid-block').filter({ hasText: 'Drag schedule' }).first();
  await expect(scheduledEvent).toBeVisible();
  const initialLabel = await scheduledEvent.locator('small').textContent();
  expect(initialLabel).toBeTruthy();

  await dragCalendarEventTo(page, 'Drag schedule', '12:00:00');

  let draggedLabel: string | null = null;
  await expect.poll(async () => {
    draggedLabel = await page.locator('.mindoist-time-grid-block').filter({ hasText: 'Drag schedule' }).first().locator('small').textContent();
    return draggedLabel;
  }).not.toBe(initialLabel);

  await page.reload();
  await expectView(page, '7 days');
  await expect(page.locator('.mindoist-time-grid-block').filter({ hasText: 'Drag schedule' }).first().locator('small')).toHaveText(draggedLabel!);
  expect(pageErrors).toEqual([]);
});

test('[CALENDAR-03] a task date range stays continuous across week rows and views', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  const dates = await page.evaluate(() => {
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    const daysUntilFriday = (5 - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + daysUntilFriday);
    const start = new Date(cursor);
    const due = new Date(cursor);
    due.setDate(due.getDate() + 4);
    const toDateOnly = (date: Date) => {
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };
    return { start: toDateOnly(start), due: toDateOnly(due) };
  });

  const created = await page.evaluate(async ({ start, due }) => {
    const token = localStorage.getItem('token');
    const response = await fetch('/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Continuous launch range',
        startDate: start,
        deadline: { date: due },
      }),
    });
    return response.json();
  }, dates);
  expect(created.success).toBe(true);

  await page.goto('/calendar?view=month&plan=0');
  const monthRange = page
    .locator('.mindoist-month-event.is-range')
    .filter({ hasText: 'Continuous launch range' });
  await expect(monthRange.first()).toBeVisible();
  expect(await monthRange.count()).toBeGreaterThanOrEqual(2);
  await expect(monthRange.first()).toHaveAttribute('title', 'Continuous launch range');
  await expect(
    page.locator('.mindoist-month-event.is-deadline').filter({ hasText: 'Continuous launch range' }),
  ).toHaveCount(1);

  await selectView(page, '7 days');
  await expect(
    page.locator('.mindoist-calendar-grid-chip.is-range').filter({
      hasText: 'Continuous launch range',
    }).first(),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('[CALENDAR-04] selecting a time range creates a task with persisted planned time', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await register(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('sidebar-projects').click();
  await page.getByRole('button', { name: 'New project' }).click();
  const projectDialog = page.getByTestId('create-project-dialog');
  await projectDialog.getByRole('textbox', { name: 'Project name' }).fill('Jade focus');
  await projectDialog.getByRole('button', { name: 'Jade' }).click();
  await projectDialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('button', { name: 'Jade focus', exact: true })).toBeVisible();
  await page.goto('/calendar?view=day&plan=0');
  const dayGrid = page.locator('.mindoist-time-grid').first();
  await expect(dayGrid).toBeVisible();
  const gridBox = await dayGrid.boundingBox();
  if (!gridBox) throw new Error('Calendar time grid has no bounding box');
  const yAt = (hour: number, minute = 0) => gridBox.y + (((hour * 60 + minute) - 6 * 60) / (17 * 60)) * gridBox.height;
  await page.mouse.move(gridBox.x + gridBox.width / 2, yAt(9));
  await page.mouse.down();
  await page.mouse.move(gridBox.x + gridBox.width / 2, yAt(10), { steps: 8 });
  await page.mouse.up();

  const inlineTitle = page.getByRole('textbox', { name: 'Task name' });
  await expect(inlineTitle).toBeVisible();
  await page.getByRole('combobox', { name: 'Project' }).selectOption({ label: 'Jade focus' });
  const inlineForm = page.getByRole('form', { name: 'Create scheduled task' });
  await expect(inlineForm).toHaveAttribute(
    'style',
    /--calendar-draft-identity-color:\s*var\(--color-project-jade\)/,
  );
  await expect(inlineForm).toHaveCSS('border-left-style', 'none');
  const colorPicker = page.getByRole('group', { name: 'Task color' });
  await expect(colorPicker).toBeVisible();
  await colorPicker.getByRole('button', { name: 'Rose' }).click();
  await expect(inlineForm).toHaveAttribute(
    'style',
    /--calendar-draft-identity-color:\s*var\(--color-project-rose\)/,
  );
  await page.screenshot({
    path: `${EVIDENCE_DIR}/calendar-inline-create-1440.png`,
    fullPage: true,
  });
  await inlineTitle.fill('Calendar focus block');
  await inlineTitle.press('Enter');
  await expect(inlineTitle).toBeHidden();

  const plannedBlock = page.locator('.mindoist-time-grid-block').filter({ hasText: 'Calendar focus block' });
  await expect(plannedBlock).toBeVisible();
  await expect(plannedBlock).toHaveCSS('border-left-style', 'none');
  await expect(plannedBlock).toHaveAttribute(
    'style',
    /--calendar-identity-color:\s*var\(--color-project-rose\)/,
  );
  await expect(page.locator('.mindoist-deadline-marker').filter({ hasText: 'Calendar focus block' })).toHaveCount(0);
  await page.reload();
  const persistedBlock = page.locator('.mindoist-time-grid-block').filter({ hasText: 'Calendar focus block' });
  await expect(persistedBlock).toBeVisible();
  await expect(persistedBlock).toHaveCSS('border-left-style', 'none');
  await expect(persistedBlock).toHaveAttribute(
    'style',
    /--calendar-identity-color:\s*var\(--color-project-rose\)/,
  );
  await expect(page.locator('.mindoist-deadline-marker').filter({ hasText: 'Calendar focus block' })).toHaveCount(0);

  await page.locator('.mindoist-time-grid-block').filter({ hasText: 'Calendar focus block' }).click();
  const plannedTimeEditor = page.getByRole('region', { name: 'Planned time' });
  await expect(plannedTimeEditor).toBeVisible();
  await expect(plannedTimeEditor.getByRole('button', { name: /^Edit.*09:00.*10:00/ })).toBeVisible();

  await page.getByTestId('detail-title-complete').click();
  await expect(page.getByTestId('task-detail')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
