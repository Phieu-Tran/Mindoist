import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage, type SettingsCategory } from './SettingsPage';
import type { User } from '@mindoist/shared/types';
import { DEFAULT_OBSIDIAN_SETTINGS, type ObsidianSettings } from '@/lib/obsidian-settings';

const user: User = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  timeZone: null,
  onboardingRequired: false,
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('SettingsPage', () => {
  let onGoToImport: ReturnType<typeof vi.fn>;
  let onGoToExport: ReturnType<typeof vi.fn>;
  let onConnectGoogle: ReturnType<typeof vi.fn>;
  let onSetPassword: ReturnType<typeof vi.fn>;
  let onSaveObsidianSettings: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.setItem('token', 'test-token');
    onGoToImport = vi.fn();
    onGoToExport = vi.fn();
    onConnectGoogle = vi.fn();
    onSetPassword = vi.fn().mockResolvedValue(null);
    onSaveObsidianSettings = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => ({
      json: async () => ({
        success: true,
        data: String(input).includes('/integrations/telegram/status')
          ? { state: 'unlinked', botUsername: 'MindoistTestBot' }
          : { connected: false },
      }),
    } as Response));
  });

  let onUpdateWorkHoursPerDay: ReturnType<typeof vi.fn>;

  const renderPage = (
    gcalConnected = false,
    initialCategory: SettingsCategory = 'account',
    obsidianSettings: ObsidianSettings = DEFAULT_OBSIDIAN_SETTINGS,
  ) => {
    onUpdateWorkHoursPerDay = vi.fn().mockResolvedValue(undefined);
    return render(
      <I18nextProvider i18n={i18n}>
        <SettingsPage
          user={user}
          gcalConnected={gcalConnected}
          onConnectGoogle={onConnectGoogle}
          onSetPassword={onSetPassword}
          onGoToImport={onGoToImport}
          onGoToExport={onGoToExport}
          pomodoroWorkMinutes={25}
          pomodoroBreakMinutes={5}
          onUpdatePomodoroDurations={vi.fn()}
          workHoursPerDay={8}
          onUpdateWorkHoursPerDay={onUpdateWorkHoursPerDay}
          obsidianSettings={obsidianSettings}
          onSaveObsidianSettings={onSaveObsidianSettings}
          initialCategory={initialCategory}
        />
      </I18nextProvider>,
    );
  };

  it('shows the account panel by default with the signed-in user', () => {
    renderPage();
    expect(screen.getByTestId('settings-panel-account')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByTestId('settings-panel-account')).toHaveTextContent('ada@example.com');
  });

  it('D7: does not duplicate Logout in the account panel (lives in the sidebar footer only)', () => {
    renderPage();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
  });

  it('saves a new account password from the account panel', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('settings-password-input'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByTestId('settings-password-confirm-input'), {
      target: { value: 'new-password123' },
    });
    fireEvent.click(screen.getByTestId('settings-password-save-btn'));

    await waitFor(() => expect(onSetPassword).toHaveBeenCalledWith('new-password123'));
    expect(await screen.findByTestId('settings-password-success')).toHaveTextContent('Password saved.');
  });

  it('rejects mismatched account passwords before calling the API', () => {
    renderPage();

    fireEvent.change(screen.getByTestId('settings-password-input'), { target: { value: 'new-password123' } });
    fireEvent.change(screen.getByTestId('settings-password-confirm-input'), { target: { value: 'different123' } });
    fireEvent.click(screen.getByTestId('settings-password-save-btn'));

    expect(onSetPassword).not.toHaveBeenCalled();
    expect(screen.getByTestId('settings-password-error')).toHaveTextContent('Passwords do not match.');
  });

  it('switches to the appearance panel', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('settings-tab-appearance'));
    expect(screen.getByTestId('settings-panel-appearance')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('switches to the data panel and navigates to import and export', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('settings-tab-data'));
    fireEvent.click(screen.getByTestId('settings-go-to-import'));
    expect(onGoToImport).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('settings-go-to-export'));
    expect(onGoToExport).toHaveBeenCalled();
  });

  it('shows the shared Telegram connection in Integrations', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('settings-tab-integrations'));
    expect(screen.getByTestId('settings-panel-integrations')).toBeInTheDocument();
    expect(await screen.findByTestId('telegram-connect')).toHaveTextContent('Connect Telegram');
  });

  it('opens Integrations directly and saves a vault-relative Obsidian destination', async () => {
    renderPage(false, 'integrations');

    expect(screen.getByTestId('settings-panel-integrations')).toBeInTheDocument();
    await screen.findByTestId('telegram-connect');
    fireEvent.change(screen.getByTestId('obsidian-vault-input'), { target: { value: ' Hiếu - Personal ' } });
    fireEvent.change(screen.getByTestId('obsidian-folder-input'), { target: { value: '\\03_Project\\Mindoist\\' } });
    fireEvent.change(screen.getByTestId('obsidian-filename-input'), {
      target: { value: 'Tổng kết Mindoist {{yyyy-MM}}.md' },
    });
    fireEvent.change(screen.getByTestId('obsidian-weekly-filename-input'), {
      target: { value: 'Tổng kết tuần {{weekStart}}.md' },
    });

    expect(screen.getByTestId('obsidian-path-preview')).toHaveTextContent(
      /Hiếu - Personal \/ 03_Project\/Mindoist\/Tổng kết Mindoist 20\d{2}-\d{2}\.md/,
    );
    expect(screen.getByTestId('obsidian-weekly-path-preview')).toHaveTextContent(
      /Hiếu - Personal \/ 03_Project\/Mindoist\/Tổng kết tuần 20\d{2}-\d{2}-\d{2}\.md/,
    );
    fireEvent.click(screen.getByTestId('obsidian-settings-save'));

    expect(onSaveObsidianSettings).toHaveBeenCalledWith({
      vault: 'Hiếu - Personal',
      folder: '03_Project/Mindoist',
      filenameTemplate: 'Tổng kết Mindoist {{yyyy-MM}}',
      weeklyFilenameTemplate: 'Tổng kết tuần {{weekStart}}',
    });
    expect(screen.getByTestId('obsidian-settings-saved')).toHaveTextContent('Saved');
  });

  it('requires a month token before saving Obsidian settings', async () => {
    renderPage(false, 'integrations');
    await screen.findByTestId('telegram-connect');
    fireEvent.change(screen.getByTestId('obsidian-vault-input'), { target: { value: 'Hiếu - Personal' } });
    fireEvent.change(screen.getByTestId('obsidian-filename-input'), { target: { value: 'Monthly review' } });
    fireEvent.click(screen.getByTestId('obsidian-settings-save'));

    expect(onSaveObsidianSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Include {{yyyy-MM}}');
    expect(screen.getByTestId('obsidian-filename-input')).toHaveFocus();
  });

  it('switches to the about panel', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('settings-tab-about'));
    expect(screen.getByTestId('settings-panel-about')).toHaveTextContent('Mindoist');
  });

  it('saves a changed work-hours-per-day value from the productivity panel', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('settings-tab-productivity'));
    const input = screen.getByTestId('work-hours-input');
    expect(input).toHaveValue(8);

    fireEvent.change(input, { target: { value: '6' } });
    const saveButton = screen.getByTestId('work-hours-save-btn');
    fireEvent.click(saveButton);

    expect(saveButton).toBeDisabled();
    await waitFor(() => expect(onUpdateWorkHoursPerDay).toHaveBeenCalledWith(6));
    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });

  it('clamps work-hours-per-day to [1, 24] on blur', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('settings-tab-productivity'));
    const input = screen.getByTestId('work-hours-input');

    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(24);
  });
});
