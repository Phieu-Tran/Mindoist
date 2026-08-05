import { expect, test, type Page } from '@playwright/test';

function uniqueEmail() {
  return `e2e-drive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.locator('input[type="text"]').fill('Drive E2E User');
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').nth(0).fill('e2e-password');
  await page.locator('input[type="password"]').nth(1).fill('e2e-password');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

async function mockGcalStatus(page: Page, connected: boolean) {
  await page.route('**/gcal/status', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { connected } }),
    }),
  );
}

async function navigateToSettings(page: Page) {
  await page.getByTestId('sidebar-settings').click();
  await page.getByTestId('settings-tab-google').click();
  // Wait for GoogleDriveBackup component to render — either connect prompt or backup UI
  await expect(
    page.getByTestId('drive-connect-button').or(page.getByTestId('drive-backup-button')),
  ).toBeVisible();
}

const MOCK_BACKUP = {
  fileId: 'e2e-test-file-001',
  fileName: 'mindoist-backup-2026.json',
  sizeBytes: 4096,
  createdAt: '2026-07-21T10:00:00.000Z',
};

test.describe('Google Drive Backup', () => {
  test('[X3] shows connect prompt when Google not connected', async ({ page }) => {
    // Mock gcal/status as NOT connected — set up before register so App.tsx
    // picks up the mock response when the useEffect([user]) fires after login
    await mockGcalStatus(page, false);
    await register(page);
    await navigateToSettings(page);

    await expect(page.getByTestId('drive-connect-button')).toBeVisible();
    // Backup list and "no backups" message should not be present
    await expect(page.getByTestId('drive-backup-list')).toHaveCount(0);
    await expect(page.getByTestId('drive-no-backups')).toHaveCount(0);
  });

  test('[X3] creates a backup and shows it in history', async ({ page }) => {
    // Mock gcal/status as connected — must be set before register so App.tsx
    // receives connected=true when useEffect([user]) fires after registration
    await mockGcalStatus(page, true);

    // Track call count so first fetch (on mount) returns empty, second (after create) returns file
    let backupsCallCount = 0;
    await page.route('**/drive/backups', route => {
      backupsCallCount++;
      const data = backupsCallCount === 1 ? [] : [MOCK_BACKUP];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data }),
      });
    });

    // Mock POST /drive/backup (create endpoint — singular "backup", no trailing id)
    await page.route('**/drive/backup', route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { ...MOCK_BACKUP, exportedAt: new Date().toISOString() },
          }),
        });
      }
      return route.fallback();
    });

    await register(page);
    await navigateToSettings(page);
    await expect(page.getByTestId('drive-no-backups')).toBeVisible();
    await expect(page.getByTestId('drive-backup-button')).toBeVisible();

    // Click backup button
    await page.getByTestId('drive-backup-button').click();

    // Success message appears
    await expect(page.getByTestId('drive-message')).toBeVisible();
    await expect(page.getByTestId('drive-message')).toContainText('Backup created');

    // After refetch, the new backup appears in the list (persistence proof)
    await expect(page.getByTestId('drive-backup-list')).toBeVisible();
    await expect(page.getByTestId(`drive-backup-${MOCK_BACKUP.fileId}`)).toBeVisible();
  });

  test('[X3] restore requires confirm then calls restore endpoint', async ({ page }) => {
    await mockGcalStatus(page, true);

    // Mock GET /drive/backups — returns one backup
    await page.route('**/drive/backups', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [MOCK_BACKUP] }),
      }),
    );

    // Mock POST /drive/restore/:fileId
    await page.route('**/drive/restore/**', route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { tasks: 12, projects: 3, tags: 5, notes: 7 },
          }),
        });
      }
      return route.fallback();
    });

    await register(page);
    await navigateToSettings(page);
    await expect(page.getByTestId(`drive-backup-${MOCK_BACKUP.fileId}`)).toBeVisible();

    // Click restore — confirm prompt appears
    await page.getByTestId(`drive-restore-${MOCK_BACKUP.fileId}`).click();
    await expect(page.getByTestId(`drive-restore-confirm-${MOCK_BACKUP.fileId}`)).toBeVisible();

    // Click confirm — restore API is called
    await page.getByTestId(`drive-restore-confirm-${MOCK_BACKUP.fileId}`).click();

    // Success message with restore counts
    await expect(page.getByTestId('drive-message')).toBeVisible();
    await expect(page.getByTestId('drive-message')).toContainText('12');
    await expect(page.getByTestId('drive-message')).toContainText('3');
  });

  test('[X3] deletes a backup and removes it from history', async ({ page }) => {
    await mockGcalStatus(page, true);

    // Track call count: first returns file, second (after delete) returns empty
    let backupsCallCount = 0;
    await page.route('**/drive/backups', route => {
      backupsCallCount++;
      const data = backupsCallCount === 1 ? [MOCK_BACKUP] : [];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data }),
      });
    });

    // Mock DELETE /drive/backup/:fileId
    await page.route('**/drive/backup/**', route => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: null }),
        });
      }
      return route.fallback();
    });

    await register(page);
    await navigateToSettings(page);
    await expect(page.getByTestId(`drive-backup-${MOCK_BACKUP.fileId}`)).toBeVisible();

    // Click delete
    await page.getByTestId(`drive-delete-${MOCK_BACKUP.fileId}`).click();

    // Success message appears
    await expect(page.getByTestId('drive-message')).toBeVisible();
    await expect(page.getByTestId('drive-message')).toContainText('deleted');

    // After refetch, file is removed from list (persistence proof — not just message)
    await expect(page.getByTestId(`drive-backup-${MOCK_BACKUP.fileId}`)).toHaveCount(0);
    await expect(page.getByTestId('drive-no-backups')).toBeVisible();
  });
});
