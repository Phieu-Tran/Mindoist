import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = '../../docs/design/evidence/UI-UX-REDESIGN-2026-07-26';

function uniqueEmail() {
  return `e2e-templates-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('accent', 'ocean');
    localStorage.setItem('theme', 'light');
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Templates E2E User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function openProjectDialog(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const addProject = page.getByTestId('sidebar-add-project');
      if (await addProject.isVisible().catch(() => false)) {
        await addProject.click();
      } else {
        const menu = page.getByTestId('menu-toggle');
        await expect(menu).toBeVisible();
        await menu.click();
        await expect(addProject).toBeVisible();
        await addProject.click();
      }
      await expect(page.getByTestId('create-project-dialog')).toBeVisible();
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(200);
    }
  }
}

async function closeProjectDialog(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('create-project-dialog')).toHaveCount(0);
}

test('[B1.8] project templates and color picker create modern workspaces', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));

  await register(page);

  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    await openProjectDialog(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('create-project-dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /Daily Log/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Job Search/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Personal/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Custom/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(pageErrors).toEqual([]);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/templates-${viewport.width}.png`,
      fullPage: true,
    });
    await closeProjectDialog(page);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openProjectDialog(page);
  const projectName = `Career Pipeline ${Date.now()}`;
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: /Job Search/ }).click();
  await page.getByRole('button', { name: 'Jade' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  // The shell owns the route h1 while the workspace has its own visible h2.
  // Target the workspace heading so the Direction-B per-route h1 does not
  // make this assertion ambiguous.
  await expect(page.locator('#project-workspace-title')).toHaveText(projectName);
  // Direction B defaults a newly-created project to List; Board is opt-in.
  await expect(page.getByTestId('project-list')).toBeVisible();
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(page.getByTestId('project-board')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Applied' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Screen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Interview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Offer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rejected' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
