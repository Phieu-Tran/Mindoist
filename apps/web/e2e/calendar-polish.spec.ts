import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

function uniqueEmail() {
  return `e2e-calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Calendar E2E User');
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
  await expect(page.getByTestId('task-list').getByText(title, { exact: true })).toBeVisible();
}

test('My Day shows upcoming countdown covers and calendar deadlines are readable', async ({ page }) => {
  await register(page);
  const coverUrl = 'https://example.test/countdown-cover.svg';
  await page.route(coverUrl, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="blue"/></svg>' }));
  const statuses = await page.evaluate(async imageUrl => {
    const headers = { authorization: `Bearer ${localStorage.getItem('token')}`, 'content-type': 'application/json' };
    const requests = [
      ['/countdowns', { title: 'Past event', targetDate: '2000-01-01' }],
      ['/countdowns', { title: 'Later event', targetDate: '2099-02-01' }],
      ['/countdowns', { title: 'Nearest event', targetDate: '2099-01-01', imageUrl }],
      ['/tasks', { title: 'Readable deadline', deadline: { date: '2099-01-01', time: '09:00', timeZone: 'UTC' } }],
      ['/tasks', { title: 'Nearby deadline', deadline: { date: '2099-01-01', time: '09:15', timeZone: 'UTC' } }],
    ] as const;
    return Promise.all(requests.map(async ([path, body]) => (await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) })).status));
  }, coverUrl);
  expect(statuses.every(status => status === 201)).toBe(true);
  await page.reload();
  const widget = page.getByTestId('today-countdown-widget');
  await expect(widget.getByRole('article')).toHaveCount(2);
  await expect(widget.getByRole('article').first()).toContainText('Nearest event');
  await expect(widget).not.toContainText('Past event');
  await expect(widget.locator('img')).toBeVisible();
  await expect(widget.locator('img')).toHaveJSProperty('naturalWidth', 64);

  await page.goto('/calendar?view=day&date=2099-01-01&plan=0');
  const first = page.getByRole('button', { name: 'Readable deadline, deadline 09:00' });
  const second = page.getByRole('button', { name: 'Nearby deadline, deadline 09:15' });
  await expect(first).toHaveCSS('height', '44px');
  await expect(first).toHaveCSS('font-size', '13px');
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox!.x + firstBox!.width).toBeLessThanOrEqual(secondBox!.x);
  await first.click();
  await expect(page.getByTestId('detail-title')).toHaveValue('Readable deadline');
});

test('[B1.3] calendar priority legend and event identity remain responsive', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  await addTask(page, 'A urgent launch today p1', 'A urgent launch');
  await addTask(page, 'High review today p2', 'High review');
  await addTask(page, 'Medium planning today p3', 'Medium planning');
  await addTask(page, 'Low cleanup today p4', 'Low cleanup');
  await page.goto('/calendar?view=month&plan=0');

  const legend = page.getByRole('list', { name: 'Priority' });
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('P1 Urgent');
  await expect(legend).toContainText('P4 Low');

  const urgentEvent = page.locator('.mindoist-month-event').filter({ hasText: 'A urgent launch' }).first();
  await expect(urgentEvent).toBeVisible();
  await expect(urgentEvent).toHaveAttribute('title', 'A urgent launch');
  await expect(urgentEvent).toHaveCSS('border-left-color', /rgb|oklch|color/);

  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    await page.evaluate(() => document.fonts.ready);
    await expect(legend).toBeVisible();
    await expect(urgentEvent).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(pageErrors).toEqual([]);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/calendar-priority-${viewport.width}.png`,
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/calendar?view=week&plan=0');
  await expect(page.locator('.mindoist-calendar-grid')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${EVIDENCE_DIR}/calendar-week-1440.png`,
    fullPage: true,
  });
});
