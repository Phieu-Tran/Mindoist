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
  await page.getByTestId('add-task-input').fill(value);
  await page.getByTestId('add-task-btn').click();
  await expect(page.locator('[data-testid^="task-title-"]').filter({ hasText: title }).first()).toBeVisible();
}

async function dragCalendarEventTo(page: Page, title: string, targetTime: string) {
  const event = page.locator('.fc-timegrid-event:visible').filter({ hasText: title }).first();
  await expect(event).toBeVisible();
  const targetSlot = page.locator(`.fc-timegrid-slot-lane[data-time="${targetTime}"]`).first();
  await expect(targetSlot).toBeVisible();
  await event.dragTo(targetSlot, { force: true });
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
  await expect(page.locator('.fc-timegrid:visible')).toBeVisible();
  await expect(page.locator('.fc-timegrid-event:visible').filter({ hasText: 'Design review' })).toBeVisible();
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
    await expect(page.locator('.fc-timegrid:visible')).toBeVisible();
    await expect(page.locator('.fc-timegrid-event:visible').filter({ hasText: 'Design review' })).toBeVisible();
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
  const scheduledEvent = page.locator('.fc-timegrid-event:visible').filter({ hasText: 'Drag schedule' }).first();
  await expect(scheduledEvent).toBeVisible();
  const initialLabel = await scheduledEvent.getAttribute('aria-label');
  expect(initialLabel).toBeTruthy();

  await dragCalendarEventTo(page, 'Drag schedule', '12:00:00');

  let draggedLabel: string | null = null;
  await expect.poll(async () => {
    draggedLabel = await page.locator('.fc-timegrid-event:visible').filter({ hasText: 'Drag schedule' }).first().getAttribute('aria-label');
    return draggedLabel;
  }).not.toBe(initialLabel);

  await page.reload();
  await expectView(page, '7 days');
  await expect(page.locator('.fc-timegrid-event:visible').filter({ hasText: 'Drag schedule' }).first()).toHaveAttribute('aria-label', draggedLabel!);
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
        dueDate: due,
      }),
    });
    return response.json();
  }, dates);
  expect(created.success).toBe(true);

  await page.goto('/calendar?view=month&plan=0');
  const monthRange = page
    .locator('.calendar-task-range-event')
    .filter({ hasText: 'Continuous launch range' });
  await expect(monthRange.first()).toBeVisible();
  expect(await monthRange.count()).toBeGreaterThanOrEqual(2);
  await expect(monthRange.filter({ has: page.locator('.calendar-event-tooltip') }).first()).toHaveAttribute(
    'aria-label',
    new RegExp(`Date range · ${dates.start} – ${dates.due}`),
  );
  await expect(monthRange.locator('xpath=self::*[contains(@class, "fc-event-start")]')).toHaveCount(1);
  await expect(monthRange.locator('xpath=self::*[contains(@class, "fc-event-end")]')).toHaveCount(1);
  await expect(
    page.locator('.calendar-deadline-event').filter({ hasText: 'Continuous launch range' }),
  ).toHaveCount(0);

  await selectView(page, '7 days');
  await expect(
    page.locator('.fc-timegrid:visible .calendar-task-range-event').filter({
      hasText: 'Continuous launch range',
    }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
