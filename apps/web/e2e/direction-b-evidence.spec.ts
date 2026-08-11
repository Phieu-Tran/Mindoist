import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';
const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 768, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByTestId('register-name').fill('Direction B Evidence');
  await page.getByTestId('register-email').fill(
    `direction-b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
  );
  await page.getByTestId('register-password').fill('e2e-password');
  await page.getByTestId('register-confirm').fill('e2e-password');
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/today$/);
}

async function addTask(page: Page, input: string, title: string) {
  await page.getByTestId('add-task-input').fill(input);
  await page.getByTestId('add-task-btn').click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

async function assertCaptureReady(page: Page, required: Locator) {
  await page.evaluate(() => document.fonts.ready);
  await expect(required).toBeVisible();
  await expect.poll(() => required.evaluate(element => {
    let current: Element | null = element;
    while (current && current !== document.body) {
      if (Number.parseFloat(getComputedStyle(current).opacity) < 0.99) return false;
      current = current.parentElement;
    }
    return true;
  })).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('[JOURNEY-04] captures Direction B primary, detail, More, and List-first project surfaces at four breakpoints', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await page.setViewportSize(VIEWPORTS[3]);
  await register(page);
  await addTask(page, 'Capture quarterly goals', 'Capture quarterly goals');
  await addTask(page, 'Review launch plan today p1', 'Review launch plan');

  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const projectName = `Launch workspace ${Date.now()}`;
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('#project-workspace-title')).toHaveText(projectName);
  await expect(page.getByTestId('project-list')).toBeVisible();
  const projectUrl = page.url();
  await addTask(page, 'Ship onboarding today p2', 'Ship onboarding');

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);

    await page.goto('/today');
    await assertCaptureReady(page, page.getByText('Review launch plan', { exact: true }));
    await page.screenshot({ path: `${EVIDENCE_DIR}/my-day-${viewport.width}.png`, fullPage: true });

    await page.goto('/tasks');
    await assertCaptureReady(page, page.getByText('Capture quarterly goals', { exact: true }));
    await expect(page.getByRole('navigation', { name: 'Task views' })).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE_DIR}/tasks-${viewport.width}.png`, fullPage: true });

    await page.getByText('Capture quarterly goals', { exact: true }).click();
    const detail = page.getByTestId('task-detail');
    await assertCaptureReady(page, detail);
    if (viewport.width < 1280) {
      await expect(detail).toHaveAttribute('role', 'dialog');
      await expect(detail).toHaveAttribute('aria-modal', 'true');
    }
    await expect.poll(
      () => detail.evaluate(element => getComputedStyle(element.parentElement!).opacity),
    ).toBe('1');
    await page.screenshot({ path: `${EVIDENCE_DIR}/task-detail-${viewport.width}.png`, fullPage: true });
    await page.locator('[data-testid="detail-close"]:visible, [data-testid="detail-close-desktop"]:visible').first().click();
    await expect(detail).toHaveCount(0);

    await page.goto('/review');
    await assertCaptureReady(page, page.getByTestId('summary-dashboard'));
    if (viewport.width < 1280) {
      if (viewport.width < 768) {
        await page.getByRole('button', { name: 'More', exact: true }).click();
      } else {
        await page.getByTestId('menu-toggle').click();
      }
      const drawer = page.getByRole('dialog', { name: 'Toggle sidebar' });
      await expect(drawer).toBeVisible();
      await expect.poll(async () => Math.round((await drawer.boundingBox())?.x ?? -1)).toBe(0);
      await expect(page.getByTestId('sidebar-summary')).toBeVisible();
      await expect(page.getByTestId('sidebar-notes')).toBeVisible();
      await expect(page.getByTestId('sidebar-settings')).toBeVisible();
    } else {
      await expect(page.getByText('More', { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${EVIDENCE_DIR}/more-${viewport.width}.png`, fullPage: true });

    await page.goto(projectUrl);
    await assertCaptureReady(page, page.getByText('Ship onboarding', { exact: true }));
    await expect(page.getByTestId('project-list')).toBeVisible();
    if (viewport.width < 768) {
      const bottomNav = page.getByTestId('bottom-nav');
      await expect(bottomNav).toBeVisible();
      const navBox = await bottomNav.boundingBox();
      expect(navBox && navBox.y + navBox.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.screenshot({ path: `${EVIDENCE_DIR}/project-list-${viewport.width}.png`, fullPage: true });
  }

  expect(pageErrors).toEqual([]);
});

test('[MORE-01] every secondary destination remains reachable by authenticated deep link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);

  // Import/Export have no sidebar nav entry by design (fix(ui) af21bd5 — they're
  // reachable only via Settings > Data, to avoid listing the same destination
  // twice) so they're checked separately below without a sidebar aria-current assertion.
  const destinations = [
    ['/review', 'Summary', 'summary'],
    ['/history/completed', 'Completed', 'completed'],
    ['/history/trash', 'Trash', 'trashed'],
    ['/notes', 'Notes', 'notes'],
    ['/countdown', 'Countdown', 'countdown'],
    ['/settings', 'Settings', 'settings'],
  ] as const;

  for (const [path, title, sidebarId] of destinations) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, '\\$&')}$`));
    await expect(page.locator('h1').filter({ hasText: title }).first()).toBeAttached();
    await expect(page.getByTestId(`sidebar-${sidebarId}`)).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  const noSidebarNavDestinations = [
    ['/import', 'Import'],
    ['/export', 'Export'],
  ] as const;

  for (const [path, title] of noSidebarNavDestinations) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, '\\$&')}$`));
    await expect(page.locator('h1').filter({ hasText: title }).first()).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await page.goto('/settings');
  await page.reload();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('settings-tab-account')).toBeVisible();
});
