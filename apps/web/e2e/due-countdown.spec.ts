import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/B1.2-due-countdown';

function uniqueEmail() {
  return `e2e-countdown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Countdown E2E User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function setDeadlineInFortyFiveMinutes(page: Page) {
  // The custom TimePicker offers 15-minute slots, so floor (+45m) to the
  // previous slot: the deadline lands 30-45 minutes ahead, still 'critical'.
  const deadline = await page.evaluate(() => {
    const date = new Date(Date.now() + 45 * 60_000);
    date.setMinutes(Math.floor(date.getMinutes() / 15) * 15, 0, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      day: date.getDate(),
      monthLabel: date.toLocaleString('en', { month: 'long', year: 'numeric' }),
      time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    };
  });

  await page.getByTestId('detail-deadline-v2').click();
  const popup = page.getByRole('dialog', { name: 'Pick date' });
  await expect(popup).toBeVisible();
  for (let i = 0; i < 2; i++) {
    if (await popup.getByText(deadline.monthLabel, { exact: true }).isVisible()) break;
    await popup.getByRole('button', { name: 'Next month' }).click();
  }
  await popup.getByRole('button', { name: String(deadline.day), exact: true }).click();
  await expect(popup).not.toBeVisible();

  await page.getByTestId('detail-deadline-time-v2').click();
  await page.getByRole('option', { name: deadline.time, exact: true }).click();

  await expect(page.getByTestId('detail-due-countdown')).toHaveAttribute('data-urgency', 'critical');
  await page.getByTestId('detail-save').click();
}

test('[B1.2] countdown persists on task row and detail at required widths', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);
  const title = `Deadline focus ${Date.now()}`;
  await page.getByTestId('add-task-input').fill(title);
  await page.getByTestId('add-task-btn').click();
  await page.getByTestId('task-list').getByText(title, { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await setDeadlineInFortyFiveMinutes(page);

  const taskTestId = await page
    .getByTestId(/^task-[0-9a-f-]{36}$/)
    .filter({ hasText: title })
    .getAttribute('data-testid');
  const taskId = taskTestId?.replace(/^task-/, '');
  expect(taskId).toBeTruthy();
  await expect(page.getByTestId(`task-countdown-${taskId}`)).toHaveAttribute('data-urgency', 'critical');

  await page.reload();
  await expect(page.getByTestId(`task-countdown-${taskId}`)).toHaveAttribute('data-urgency', 'critical');
  await page.getByTestId('task-list').getByText(title, { exact: true }).click();
  await expect(page.getByTestId('detail-due-countdown')).toHaveAttribute('data-urgency', 'critical');

  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('detail-due-countdown')).toBeVisible();
    await expect(page.getByTestId('detail-due-countdown')).toContainText(/Due in \d+m/);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(pageErrors).toEqual([]);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/countdown-${viewport.width}.png`,
      fullPage: true,
    });
  }
});
