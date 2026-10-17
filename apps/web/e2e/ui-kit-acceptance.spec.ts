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

// A cold CDN edge or a stale deploy can answer a hashed asset with index.html
// (HTTP 200). Serve that for the HeroUI kit's chunk or stylesheet.
async function breakHeroUiAsset(page: Page, kind: 'js' | 'css', times: number) {
  let broken = 0;
  await page.route(/\/assets\/[^/]+\.(js|css)$/, async route => {
    const isCss = route.request().url().endsWith('.css');
    if ((kind === 'css') !== isCss || broken >= times) return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    const isHeroUi = isCss ? body.includes('.mindoist-popover-panel') : body.includes('HeroUI.');
    if (!isHeroUi) return route.fulfill({ response, body });
    broken += 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Mindoist</title>' });
  });
}

const herouiStylesApplied = (page: Page) => page.evaluate(() => (
  getComputedStyle(document.documentElement).getPropertyValue('--field-radius').trim() !== ''
));

for (const kind of ['js', 'css'] as const) {
  test(`[KIT-06] a HeroUI ${kind} asset that fails once is retried with one reload`, async ({ page }) => {
    await breakHeroUiAsset(page, kind, 1);
    await page.goto('/login?ui-kit=heroui');
    await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
    await expect.poll(() => activeKit(page)).toBe('heroui');
    expect(await herouiStylesApplied(page), 'HeroUI stylesheet is applied').toBe(true);
  });
}

test('[KIT-07] a HeroUI asset that keeps failing falls back to the Classic kit', async ({ page }) => {
  await breakHeroUiAsset(page, 'css', 100);
  await page.goto('/login?ui-kit=heroui');
  await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
  expect(await activeKit(page)).toBe('legacy');
});

// Records every CSS animation that starts, with its computed duration, so the
// assertions don't depend on sampling inside a 90–240 ms window.
async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const log: Array<{ name: string; ms: number }> = [];
    (window as unknown as { __animations: typeof log }).__animations = log;
    document.addEventListener('animationstart', event => {
      const seconds = parseFloat(getComputedStyle(event.target as Element).animationDuration) || 0;
      log.push({ name: event.animationName, ms: seconds * 1000 });
    }, true);
  });
}
const animations = (page: Page) => page.evaluate(() => (window as unknown as { __animations: Array<{ name: string; ms: number }> }).__animations.splice(0));

async function openTaskPanel(page: Page, kit: 'legacy' | 'heroui', reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  await recordAnimations(page);
  await page.addInitScript(k => localStorage.setItem('ui-kit', k), kit);
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1280, height: 860 });
  await register(page);
  expect(await activeKit(page)).toBe(kit);
  await addTask(page, 'Motion task');
  await page.getByTestId(/^task-title-/).filter({ hasText: 'Motion task' }).click();
  await expect(page.getByTestId('task-detail')).toBeVisible();
  await animations(page);
}

const closeOutside = (page: Page) => page.getByText('Task Details', { exact: true }).click({ force: true });

test('[KIT-08] HeroUI panels open and close with motion; dialogs keep a single animation', async ({ page }) => {
  await openTaskPanel(page, 'heroui');
  const panels: Array<[string, () => Promise<void>, Locator]> = [
    ['priority', () => page.getByTestId('detail-priority').click(), page.getByRole('listbox', { name: 'Priority' })],
    ['date', () => page.getByTestId('detail-deadline-v2').click(), page.getByRole('dialog', { name: 'Pick date' })],
    ['menu', () => page.getByRole('button', { name: 'More actions' }).click(), page.getByRole('menu')],
  ];
  for (const [label, open, panel] of panels) {
    await open();
    await expect(panel).toBeVisible();
    await expect.poll(async () => (await animations(page)).map(a => a.name), { message: `${label} opens with motion` }).toContain('mindoist-pop-in');
    const closedAt = Date.now();
    await closeOutside(page);
    await expect(panel).toBeHidden();
    expect(Date.now() - closedAt, `${label} is gone quickly`).toBeLessThan(600);
    expect((await animations(page)).map(a => a.name), `${label} closes with motion`).toContain('mindoist-pop-out');
  }

  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  // Let the menu's own open animation start before clearing the log.
  await expect.poll(async () => (await animations(page)).some(a => a.name === 'mindoist-pop-in')).toBe(true);
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  // HeroUI's own backdrop fade + container zoom, timed to the Mindoist
  // tokens, and nothing stacked on top (only the menu's close besides).
  const seen: Array<{ name: string; ms: number }> = [];
  await expect.poll(async () => {
    seen.push(...await animations(page));
    return seen.filter(a => a.name === 'enter').length;
  }).toBe(2);
  expect(seen.filter(a => a.name === 'enter').map(a => a.ms).sort((a, b) => a - b)).toEqual([160, 240]);
  expect(seen.filter(a => a.name !== 'enter' && a.name !== 'mindoist-pop-out'), 'no extra dialog animation').toEqual([]);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
});

test('[KIT-08] reduced motion turns HeroUI panel motion off', async ({ page }) => {
  await openTaskPanel(page, 'heroui', 'reduce');
  await page.getByTestId('detail-priority').click();
  await expect(page.getByRole('listbox', { name: 'Priority' })).toBeVisible();
  await closeOutside(page);
  await expect(page.getByRole('listbox', { name: 'Priority' })).toBeHidden();
  const long = (await animations(page)).filter(a => a.ms > 1);
  expect(long, 'no animation longer than 1 ms').toEqual([]);
});

test('[KIT-08] the Classic kit panels are unchanged (no new motion)', async ({ page }) => {
  await openTaskPanel(page, 'legacy');
  await page.getByTestId('detail-priority').click();
  await expect(page.getByRole('listbox', { name: 'Priority' })).toBeVisible();
  await closeOutside(page);
  await expect(page.getByRole('listbox', { name: 'Priority' })).toBeHidden();
  expect((await animations(page)).filter(a => a.name.startsWith('mindoist-pop'))).toEqual([]);
});

async function seedLook(page: Page) {
  const targetDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 10);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });
  const post = (path: string, body: unknown) => page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }, { path, body });
  expect((await post('/countdowns', { title: 'Look countdown', targetDate, color: 'rose' })).success).toBe(true);
  // An undated task keeps the inbox banner on My Day.
  expect((await post('/tasks', { title: 'Look inbox task' })).success).toBe(true);
  await addTask(page, 'Look task');
}

// Computed styles of the surfaces the H10 look retunes, read on My Day.
async function lookOf(page: Page, kit: 'legacy' | 'heroui') {
  await page.goto(`/today?ui-kit=${kit}`);
  await expect.poll(() => activeKit(page)).toBe(kit);
  await expect(page.getByTestId('today-countdown-widget')).toBeVisible();
  await expect(page.getByTestId(/^task-title-/).filter({ hasText: 'Look task' })).toBeVisible();
  return page.evaluate(() => {
    const style = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`missing ${selector}`);
      return getComputedStyle(element);
    };
    const colorOf = (value: string) => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    };
    const card = style('[data-testid="today-countdown-widget"]');
    const banner = style('.inbox-banner');
    return {
      row: style('.task-row-density').borderTopLeftRadius,
      card: { radius: card.borderTopLeftRadius, border: card.borderTopColor, shadow: card.boxShadow },
      banner: { radius: banner.borderTopLeftRadius, border: banner.borderTopColor, shadow: banner.boxShadow },
      current: style('[data-testid="sidebar-today"]').backgroundColor,
      sidebarAccent: colorOf('var(--sidebar-accent)'),
      accentSoft: colorOf('var(--accent-soft)'),
      addTask: style('.sidebar-add-task').borderTopLeftRadius,
    };
  });
}

test('[KIT-09] HeroUI gives the whole app its look; Classic keeps its own', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.addInitScript(() => localStorage.setItem('ui-kit', 'legacy'));
  await register(page);
  await seedLook(page);

  const classic = await lookOf(page, 'legacy');
  // Classic: the D5 radius scale, framed cards, grey current view.
  expect(classic.row).toBe('0px');
  expect(classic.card).toMatchObject({ radius: '12px', shadow: 'none' });
  expect(classic.card.border).not.toBe('rgba(0, 0, 0, 0)');
  expect(classic.banner).toMatchObject({ radius: '8px', shadow: 'none' });
  expect(classic.current).toBe(classic.sidebarAccent);
  expect(classic.addTask).toBe('7px');
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('global-quick-capture')).toBeVisible();
  // The surface follows the dialog's radius instead of painting square corners.
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.command-surface')!).borderTopLeftRadius)).toBe('12px');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('global-quick-capture')).toBeHidden();

  const heroui = await lookOf(page, 'heroui');
  expect(heroui.row).toBe('14px');
  expect(heroui.card.radius).toBe('20px');
  expect(heroui.card.border, 'cards lose their frame').toBe('rgba(0, 0, 0, 0)');
  expect(heroui.card.shadow, 'cards are lifted instead').not.toBe('none');
  expect(heroui.banner.radius).toBe('14px');
  expect(heroui.banner.shadow).not.toBe('none');
  expect(heroui.current, 'current view is tinted with the accent').toBe(heroui.accentSoft);
  expect(heroui.current).not.toBe(classic.current);
  expect(heroui.addTask).toBe('9999px');

  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('global-quick-capture')).toBeVisible();
  const capture = await page.evaluate(() => {
    const surface = getComputedStyle(document.querySelector('.command-surface')!);
    const field = getComputedStyle(document.querySelector('.command-quick-control')!);
    return { surface: surface.borderTopLeftRadius, fieldBorder: field.borderTopColor, fieldShadow: field.boxShadow };
  });
  expect(capture.surface, 'Quick Capture keeps its rounded corners').toBe('20px');
  expect(capture.fieldBorder).toBe('rgba(0, 0, 0, 0)');
  expect(capture.fieldShadow).not.toBe('none');
  await page.keyboard.press('Escape');

  await page.goto('/settings?ui-kit=heroui');
  await expect.poll(() => activeKit(page)).toBe('heroui');
  await page.getByTestId('settings-tab-appearance').first().click();
  const toggle = page.getByTestId('ui-kit-toggle');
  await expect(toggle).toBeVisible();
  const segmented = await toggle.evaluate(element => ({
    track: getComputedStyle(element).borderTopLeftRadius,
    thumb: getComputedStyle(element.querySelector('[aria-checked="true"]')!).borderTopLeftRadius,
  }));
  expect(segmented).toEqual({ track: '9999px', thumb: '9999px' });
});
