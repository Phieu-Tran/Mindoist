import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { GoogleDriveBackup } from './GoogleDriveBackup';

vi.mock('@/hooks/useApi', () => ({
  useDriveBackups: vi.fn(() => ({
    backups: [
      { fileId: 'f1', fileName: 'backup-2026-07-20.json', sizeBytes: 45000, createdAt: '2026-07-20T15:30:00Z' },
      { fileId: 'f2', fileName: 'backup-2026-07-19.json', sizeBytes: 42000, createdAt: '2026-07-19T09:00:00Z' },
    ],
    loading: false,
    createBackup: vi.fn(),
    restoreBackup: vi.fn(),
    deleteBackup: vi.fn(),
    refetch: vi.fn(),
  })),
}));

describe('GoogleDriveBackup', () => {
  afterEach(cleanup);

  const renderBackup = (connected = true) =>
    render(
      <I18nextProvider i18n={i18n}>
        <GoogleDriveBackup
          gcalConnected={connected}
          onConnectGoogle={vi.fn()}
        />
      </I18nextProvider>,
    );

  it('shows connect button when Google is not connected', () => {
    renderBackup(false);
    expect(screen.getByTestId('drive-connect-button')).toBeInTheDocument();
  });

  it('shows backup button when connected', () => {
    renderBackup(true);
    expect(screen.getByTestId('drive-backup-button')).toBeInTheDocument();
  });

  it('shows backup history list', () => {
    renderBackup(true);
    expect(screen.getByTestId('drive-backup-list')).toBeInTheDocument();
    expect(screen.getByText('backup-2026-07-20.json')).toBeInTheDocument();
    expect(screen.getByText('backup-2026-07-19.json')).toBeInTheDocument();
  });

  it('shows restore and delete buttons for each backup', () => {
    renderBackup(true);
    expect(screen.getByTestId('drive-restore-f1')).toBeInTheDocument();
    expect(screen.getByTestId('drive-restore-f2')).toBeInTheDocument();
    expect(screen.getByTestId('drive-delete-f1')).toBeInTheDocument();
    expect(screen.getByTestId('drive-delete-f2')).toBeInTheDocument();
  });
});

describe('GoogleDriveBackup - empty state', () => {
  afterEach(cleanup);

  it('shows empty message when no backups exist', async () => {
    const { useDriveBackups } = await import('@/hooks/useApi');
    vi.mocked(useDriveBackups).mockReturnValueOnce({
      backups: [],
      loading: false,
      createBackup: vi.fn(),
      restoreBackup: vi.fn(),
      deleteBackup: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <I18nextProvider i18n={i18n}>
        <GoogleDriveBackup gcalConnected onConnectGoogle={vi.fn()} />
      </I18nextProvider>,
    );

    expect(screen.getByTestId('drive-no-backups')).toBeInTheDocument();
  });
});
