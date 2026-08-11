import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/B1.1-pomodoro-timer';

function uniqueEmail() {
  return `e2e-pomodoro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Pomodoro E2E User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
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

async function openTask(page: Page, title: string) {
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  // The Pomodoro section is collapsed by default — expand it.
  await page.getByTestId('pomodoro-toggle').click();
  await expect(page.getByTestId('pomodoro-timer')).toBeVisible();
}

test.describe('Pomodoro timer', () => {
  test('[B1.1] start, pause, reset, restore and complete a focus session', async ({ page }) => {
    await register(page);
    const title = `Focus session ${Date.now()}`;
    await addTask(page, title);
    await openTask(page, title);

    const timer = page.getByTestId('pomodoro-timer');
    const time = page.getByTestId('pomodoro-time');
    await expect(time).toHaveText('25:00');

    await timer.getByRole('button', { name: 'Start' }).click();
    await expect(timer).toHaveAttribute('data-status', 'running');
    await expect(time).not.toHaveText('25:00', { timeout: 2_500 });

    await timer.getByRole('button', { name: 'Pause' }).click();
    await expect(timer).toHaveAttribute('data-status', 'paused');
    const pausedTime = await time.textContent();
    await page.waitForTimeout(1_100);
    await expect(time).toHaveText(pausedTime ?? '24:59');

    await page.reload();
    await openTask(page, title);
    await expect(page.getByTestId('pomodoro-timer')).toHaveAttribute('data-status', 'paused');
    await expect(page.getByTestId('pomodoro-time')).toHaveText(pausedTime ?? '24:59');

    await page.getByTestId('pomodoro-timer').getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByTestId('pomodoro-time')).toHaveText('25:00');

    const taskTestId = await page
      .getByTestId(/^task-[0-9a-f-]{36}$/)
      .filter({ hasText: title })
      .getAttribute('data-testid');
    const taskId = taskTestId?.replace(/^task-/, '');
    expect(taskId).toBeTruthy();

    await page.evaluate((id) => {
      localStorage.setItem(`mindoist:pomodoro:${id}`, JSON.stringify({
        phase: 'work',
        status: 'running',
        remainingSeconds: 1,
        endTime: Date.now() + 500,
      }));
    }, taskId);
    await page.reload();
    await openTask(page, title);

    await expect(page.getByTestId('pomodoro-timer')).toHaveAttribute('data-phase', 'break', { timeout: 5_000 });
    await expect(page.getByText('1 session')).toBeVisible();
    await expect(page.getByTestId('pomodoro-time')).toHaveText(/04:5\d|05:00/);
  });

  test('[B1.1] responsive inspector evidence at required widths', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));

    await register(page);
    const title = `Responsive focus ${Date.now()}`;
    await addTask(page, title);
    await addTask(page, `Second task ${Date.now()}`);
    await openTask(page, title);

    const viewports = [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      // Crossing the xl breakpoint swaps in a fresh TaskInspector instance
      // (rail vs. mobile layout), collapsing the Pomodoro section again — and
      // right at the crossing, react can still be mid-swap for a beat after
      // the resize. Retry the whole expand-and-verify sequence as one unit
      // so it keeps re-driving whatever instance is actually live, instead
      // of assuming state from one step survives into the next.
      await expect(async () => {
        const toggle = page.getByTestId('pomodoro-toggle');
        if (await toggle.getAttribute('aria-expanded').catch(() => null) !== 'true') {
          await toggle.click({ timeout: 1_000 });
        }
        await expect(page.getByTestId('pomodoro-time')).toHaveText('25:00', { timeout: 1_000 });
      }).toPass({ timeout: 10_000 });
      await expect(page.getByRole('alert')).toHaveCount(0);
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasHorizontalOverflow).toBe(false);
      expect(pageErrors).toEqual([]);

      await page.screenshot({
        path: `${EVIDENCE_DIR}/pomodoro-${viewport.width}.png`,
        fullPage: true,
      });
    }
  });
});
