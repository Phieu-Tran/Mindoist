import { test, expect } from '@playwright/test';
import { PrismaClient } from '../../api/node_modules/@prisma/client/default.js';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const databaseUrl = 'postgresql://mindoist_user:mindoist_pass@127.0.0.1:5432/mindoist_test';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

test.afterAll(async () => {
  await prisma.aiProviderConfig.deleteMany({ where: { label: { startsWith: 'Gemini E2E ' } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'admin-e2e-' } } });
  await prisma.$disconnect();
});

test('[ADMIN-01] manages an encrypted AI provider from the admin-only UI', async ({ page }) => {
  const nonce = Date.now();
  const email = `admin-e2e-${nonce}@example.test`;
  const label = `Gemini E2E ${nonce}`;
  const apiKey = `fake-provider-key-${nonce}`;

  await page.goto('/register');
  await page.locator('input[type="text"]').fill('Admin E2E');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  await page.reload();

  await page.getByTestId('sidebar-admin').click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('#admin-title')).toBeVisible();
  await page.getByRole('button', { name: 'AI Providers' }).click();
  await page.getByRole('button', { name: 'Add provider' }).click();

  const form = page.getByRole('form', { name: 'Add provider' });
  await expect(form.getByTestId('provider-option-GEMINI')).toHaveAttribute('aria-pressed', 'true');
  await expect(form.locator('[data-testid^="provider-option-"]')).toHaveCount(5);

  const evidenceDir = fileURLToPath(new URL('../../../docs/design/evidence/admin-provider-ui/', import.meta.url));
  await mkdir(evidenceDir, { recursive: true });
  for (const viewport of [
    { name: '375', width: 375, height: 812 },
    { name: '768', width: 768, height: 900 },
    { name: '1024', width: 1024, height: 900 },
    { name: '1440', width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: join(evidenceDir, `provider-form-${viewport.name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await form.getByLabel('Display name').fill(label);
  await form.getByLabel('Model').fill('gemini-e2e-model');
  await form.getByLabel('API key').fill(apiKey);
  await form.getByLabel('Priority').fill('50');
  await form.getByRole('button', { name: 'Save provider' }).click();

  await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText(`••••${apiKey.slice(-4)}`, { exact: false })).toBeVisible();
  await expect(page.getByText(apiKey, { exact: true })).toHaveCount(0);

  const stored = await prisma.aiProviderConfig.findFirstOrThrow({ where: { label } });
  expect(stored.encryptedApiKey).not.toContain(apiKey);

  await prisma.aiProviderConfig.update({
    where: { id: stored.id },
    data: {
      lastTestStatus: 'HEALTHY',
      lastTestedAt: new Date('2026-08-03T04:00:00.000Z'),
      lastTestLatencyMs: 128,
      lastTestHttpStatus: 200,
      lastTestError: null,
    },
  });
  await page.reload();
  await page.getByRole('button', { name: 'AI Providers' }).click();
  await expect(page.getByText('Working')).toBeVisible();
  await expect(page.getByText('128 ms')).toBeVisible();
  await expect(page.getByText('Not reported')).toBeVisible();

  for (const viewport of [
    { name: '375', width: 375, height: 812 },
    { name: '768', width: 768, height: 900 },
    { name: '1024', width: 1024, height: 900 },
    { name: '1440', width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: join(evidenceDir, `providers-${viewport.name}.png`), fullPage: true });
  }

  await prisma.aiProviderConfig.delete({ where: { id: stored.id } });
  await prisma.user.delete({ where: { id: user.id } });
});
