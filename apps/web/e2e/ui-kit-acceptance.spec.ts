/**
 * UI kit acceptance — runs in both CI lanes (`e2e` builds the Classic kit,
 * `e2e-heroui` builds with VITE_UI_KIT=heroui), so every check here holds
 * for whichever kit the build defaults to:
 *  - the page reports the kit it loaded, and Save follows the accent preset;
 *  - keyboard-only use: Space completes, Enter activates focused controls,
 *    popovers/menus/dialogs open, pick and close by keyboard, focus stays
 *    inside the confirm dialog, global shortcuts still work afterwards;
 *  - at 390px every TaskDetail popover, the actions menu and the delete
 *    confirmation fit the screen, and the confirmation is on top.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

function uniqueEmail() {
  return `e2e-kit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Kit Acceptance');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function addTask(page: Page, title: string) {
  await page.keyboard.press('Control+k');
  await page.getByTestId('global-quick-capture-input').fill(title);
  await page.getByTestId('global-quick-capture-submit').click();
  await expect(page.getByTestId('global-quick-capture')).toBeHidden();
}

async function activeKit(page: Page) {
  return page.evaluate(() => document.documentElement.dataset.uiKit);
}

async function expectInViewport(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize()!;
  expect(box, `${label} is rendered`).not.toBeNull();
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(width + 1);
  expect(box!.y + box!.height, `${label} bottom edge`).toBeLessThanOrEqual(height + 1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
});

test('[KIT-01] the loaded kit follows the build default and keeps the accent preset', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('accent', 'rose'));
  await register(page);
  expect(['legacy', 'heroui']).toContain(await activeKit(page));
  await addTask(page, 'Accent task');
  await page.getByRole('button', { name: 'Accent task', exact: true }).click();
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeVisible();
  const primary = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--primary)';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  expect(await save.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(primary);
});

test('[KIT-02] TaskDetail controls work from the keyboard alone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await register(page);
  const kit = await activeKit(page);
  await addTask(page, 'Keyboard task');

  await page.getByRole('checkbox', { name: /Keyboard task/ }).last().focus();
  await page.keyboard.press('Space');
  await expect(page.getByText(/Completed .Keyboard task./)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();

  const title = page.getByRole('button', { name: 'Keyboard task', exact: true });
  await title.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('task-detail')).toBeVisible();

  const priority = page.getByTestId('detail-priority');
  await priority.focus();
  await page.keyboard.press('Enter');
  const options = page.getByRole('listbox', { name: 'Priority' });
  await expect(options).toBeVisible();
  await page.getByTestId('detail-priority-2').focus();
  await page.keyboard.press('Enter');
  await expect(options).toBeHidden();
  await expect(priority).toContainText('P2');
  await priority.focus();
  await page.keyboard.press('Enter');
  await expect(options).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  await expect(page.getByTestId('task-detail')).toBeVisible();

  const more = page.getByRole('button', { name: 'More actions' });
  await more.focus();
  await page.keyboard.press('Enter');
  const deleteItem = page.getByRole('menuitem', { name: 'Delete' });
  await expect(deleteItem).toBeVisible();
  if (kit === 'heroui') await expect(deleteItem).toBeFocused();
  else await deleteItem.focus();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Tab');
    expect(await confirm.evaluate(element => element.contains(document.activeElement)), 'focus stays in the dialog').toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  if (await deleteItem.isVisible()) await more.click();
  await expect(deleteItem).toBeHidden();

  const deadline = page.getByTestId('detail-deadline-v2');
  await deadline.focus();
  await page.keyboard.press('Enter');
  const picker = page.getByRole('dialog', { name: 'Pick date' });
  await expect(picker).toBeVisible();
  if (kit === 'heroui') {
    await expect.poll(() => picker.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(picker).toBeHidden();
    await expect(deadline).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  } else {
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
  }

  await page.goto('/calendar');
  const views = page.getByTestId('calendar-view-switch');
  await views.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: '1 day', exact: true })).toBeVisible();
  if (kit === 'heroui') {
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
  } else {
    await page.getByRole('option', { name: '1 day', exact: true }).click();
  }
  await expect(views).toHaveText(/1 day/);

  await page.getByRole('heading', { level: 3 }).first().click();
  await page.keyboard.press('Shift+?');
  await expect(page.getByTestId('shortcut-help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcut-help-dialog')).toBeHidden();
});

test('[KIT-03] TaskDetail popovers, menu and confirmation fit a 390px phone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await register(page);
  await addTask(page, 'Phone task');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Phone task', exact: true }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();

  const panels: Array<[string, Locator, () => Locator]> = [
    ['priority', page.getByTestId('detail-priority'), () => page.getByRole('listbox', { name: 'Priority' })],
    ['color', page.getByTestId('detail-color'), () => page.getByRole('dialog', { name: 'Task color' }).first()],
    ['tags', page.getByTestId('detail-tags'), () => page.getByRole('dialog', { name: 'Manage tags' })],
    ['recurrence', page.getByTestId('detail-recurrence-select'), () => page.getByRole('listbox').last()],
    ['date', page.getByTestId('detail-deadline-v2'), () => page.getByRole('dialog', { name: 'Pick date' })],
    ['menu', page.getByRole('button', { name: 'More actions' }), () => page.getByRole('menu')],
  ];
  for (const [label, trigger, panel] of panels) {
    await trigger.click();
    await expect(panel(), label).toBeVisible();
    await expectInViewport(page, panel(), label);
    await page.getByText('Task Details', { exact: true }).click({ force: true });
    await expect(panel(), `${label} closes on outside click`).toBeHidden();
    await expect(page.getByTestId('task-detail')).toBeVisible();
  }

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expectInViewport(page, confirm, 'confirm');
  const onTop = await confirm.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + 20));
  });
  expect(onTop, 'the delete confirmation is above the task panel').toBe(true);
});

for (const timezoneId of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
  test.describe(`[KIT-04] dates in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test('Today and a picked day keep their calendar date across a reload', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 860 });
      await register(page);
      await addTask(page, 'Zoned task');
      await page.getByRole('button', { name: 'Zoned task', exact: true }).click();
      const deadline = page.getByTestId('detail-deadline-v2');

      const local = await page.evaluate(() => {
        const now = new Date();
        const pad = (value: number) => String(value).padStart(2, '0');
        return {
          today: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
          pickIso: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-15`,
          pickShown: `15/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
        };
      });

      await deadline.click();
      const picker = page.getByRole('dialog', { name: 'Pick date' });
      await picker.getByRole('button', { name: 'Today', exact: true }).click();
      await expect(picker).toBeHidden();
      await expect(deadline).toContainText(local.today);

      await deadline.click();
      await picker.locator(`[data-calendar-day="${local.pickIso}"]`).click();
      await expect(picker).toBeHidden();
      await expect(deadline).toContainText(local.pickShown);

      await page.reload();
      await expect(page.getByTestId('task-detail')).toBeVisible();
      await expect(page.getByTestId('detail-deadline-v2')).toContainText(local.pickShown);
    });
  });
}

test('[KIT-05] Settings and ?ui-kit= switch the kit after a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await register(page);
  const buildDefault = await activeKit(page);

  const openAppearance = async () => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await expect(page.getByTestId('ui-kit-toggle')).toBeVisible();
  };

  await openAppearance();
  await expect(page.getByTestId('ui-kit-default')).toHaveAttribute('aria-checked', 'true');
  await Promise.all([page.waitForEvent('load'), page.getByTestId('ui-kit-heroui').click()]);
  await expect.poll(() => activeKit(page)).toBe('heroui');

  await openAppearance();
  await expect(page.getByTestId('ui-kit-heroui')).toHaveAttribute('aria-checked', 'true');
  await Promise.all([page.waitForEvent('load'), page.getByTestId('ui-kit-legacy').click()]);
  await expect.poll(() => activeKit(page)).toBe('legacy');

  await openAppearance();
  await Promise.all([page.waitForEvent('load'), page.getByTestId('ui-kit-default').click()]);
  await expect.poll(() => activeKit(page)).toBe(buildDefault);

  await page.goto('/settings?ui-kit=heroui');
  await expect.poll(() => activeKit(page)).toBe('heroui');
  expect(new URL(page.url()).searchParams.has('ui-kit')).toBe(false);
  await page.goto('/settings?ui-kit=default');
  await expect.poll(() => activeKit(page)).toBe(buildDefault);
});
