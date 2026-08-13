import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { User as UserIcon, Palette, Cloud, Upload, Info, Timer, Bell, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { ThemeToggle } from './ThemeToggle';
import { AccentPicker } from './AccentPicker';
import { LanguageSwitcher } from './LanguageSwitcher';
import { DensityToggle } from './DensityToggle';
import { GoogleConnectButton } from './GoogleConnectButton';
import { GoogleDriveBackup } from './GoogleDriveBackup';
import { TelegramConnectCard } from '@/features/telegram/TelegramConnectCard';
import { cn } from '@/lib/utils';
import {
  getPushNotificationStatus,
  subscribeToPushNotifications,
  supportsPushNotifications,
  unsubscribeFromPushNotifications,
  type PushNotificationStatus,
} from '@/lib/push-notifications';
import type { User } from '@mindoist/shared/types';

type SettingsCategory = 'account' | 'appearance' | 'integrations' | 'google' | 'data' | 'productivity' | 'about';

interface Props {
  user: User | null;
  gcalConnected: boolean;
  onConnectGoogle: () => void;
  onSetPassword: (password: string) => Promise<string | null>;
  onGoToImport: () => void;
  onGoToExport: () => void;
  pomodoroWorkMinutes: number;
  pomodoroBreakMinutes: number;
  onUpdatePomodoroDurations: (work: number, brk: number) => Promise<void>;
  workHoursPerDay: number;
  onUpdateWorkHoursPerDay: (hours: number) => Promise<void>;
}

export function SettingsPage({
  user, gcalConnected, onConnectGoogle, onSetPassword, onGoToImport, onGoToExport,
  pomodoroWorkMinutes, pomodoroBreakMinutes, onUpdatePomodoroDurations,
  workHoursPerDay, onUpdateWorkHoursPerDay,
}: Props) {
  const { t } = useTranslation('tasks');
  const { t: tc } = useTranslation('common');
  const [category, setCategory] = useState<SettingsCategory>('account');
  const [workInput, setWorkInput] = useState(String(pomodoroWorkMinutes));
  const [breakInput, setBreakInput] = useState(String(pomodoroBreakMinutes));
  const [saving, setSaving] = useState(false);
  const [workHoursInput, setWorkHoursInput] = useState(String(workHoursPerDay));
  const [savingWorkHours, setSavingWorkHours] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordConfirmInput, setPasswordConfirmInput] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<PushNotificationStatus>(() => (
    supportsPushNotifications() ? 'default' : 'unsupported'
  ));
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  const categories: { id: SettingsCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'account', label: t('settingsPage.account'), icon: UserIcon },
    { id: 'appearance', label: t('settingsPage.appearance'), icon: Palette },
    { id: 'integrations', label: t('settingsPage.integrations'), icon: Send },
    { id: 'google', label: t('settingsPage.google'), icon: Cloud },
    { id: 'data', label: t('settingsPage.data'), icon: Upload },
    { id: 'productivity', label: t('settingsPage.productivity'), icon: Timer },
    { id: 'about', label: t('settingsPage.about'), icon: Info },
  ];

  const handleSavePomodoro = async () => {
    const work = Math.max(1, Math.min(120, parseInt(workInput, 10) || 25));
    const brk = Math.max(1, Math.min(60, parseInt(breakInput, 10) || 5));
    setSaving(true);
    try {
      await onUpdatePomodoroDurations(work, brk);
      setWorkInput(String(work));
      setBreakInput(String(brk));
    } finally {
      setSaving(false);
    }
  };

  const pomodoroDirty =
    parseInt(workInput, 10) !== pomodoroWorkMinutes ||
    parseInt(breakInput, 10) !== pomodoroBreakMinutes;

  const handleSaveWorkHours = async () => {
    const hours = Math.max(1, Math.min(24, parseInt(workHoursInput, 10) || 8));
    setSavingWorkHours(true);
    try {
      await onUpdateWorkHoursPerDay(hours);
      setWorkHoursInput(String(hours));
    } finally {
      setSavingWorkHours(false);
    }
  };

  const workHoursDirty = parseInt(workHoursInput, 10) !== workHoursPerDay;

  useEffect(() => {
    if (!supportsPushNotifications()) return;
    let cancelled = false;
    getPushNotificationStatus()
      .then(status => {
        if (!cancelled) setNotificationStatus(status);
      })
      .catch(() => {
        if (!cancelled) setNotificationStatus('unsupported');
      });
    return () => { cancelled = true; };
  }, []);

  const handleToggleNotifications = async (checked: boolean) => {
    setNotificationBusy(true);
    setNotificationError(null);
    try {
      if (checked) {
        await subscribeToPushNotifications();
      } else {
        await unsubscribeFromPushNotifications();
      }
      setNotificationStatus(await getPushNotificationStatus());
    } catch (err) {
      setNotificationStatus(await getPushNotificationStatus().catch((): PushNotificationStatus => 'unsupported'));
      setNotificationError(err instanceof Error ? err.message : t('settingsPage.notificationsError'));
    } finally {
      setNotificationBusy(false);
    }
  };

  const handleSavePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (passwordInput.length < 6) {
      setPasswordError(t('settingsPage.passwordMinError'));
      return;
    }
    if (passwordInput !== passwordConfirmInput) {
      setPasswordError(t('settingsPage.passwordMismatch'));
      return;
    }

    setSavingPassword(true);
    try {
      const error = await onSetPassword(passwordInput);
      if (error) {
        setPasswordError(error);
        return;
      }
      setPasswordInput('');
      setPasswordConfirmInput('');
      setPasswordSuccess(true);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="flex max-w-[44rem] flex-col gap-6 sm:flex-row">
      <label className="grid gap-1 sm:hidden">
        <span className="text-xs font-semibold text-muted-foreground">{t('settingsPage.category')}</span>
        <select
          value={category}
          onChange={event => setCategory(event.target.value as SettingsCategory)}
          className="min-h-11 w-full rounded-control border border-input bg-card px-3 text-base text-foreground transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          data-testid="settings-category-select"
        >
          {categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <nav className="hidden w-48 shrink-0 flex-col gap-1 sm:flex" aria-label={t('settingsPage.title')}>
        {categories.map(item => {
          const Icon = item.icon;
          const active = category === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`settings-tab-${item.id}`}
              onClick={() => setCategory(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                active && 'bg-sidebar-accent font-semibold text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {category === 'account' && (
          <div data-testid="settings-panel-account" className="flex flex-col gap-4">
            <h3 className="m-0 text-lg font-semibold">{t('settingsPage.account')}</h3>
            <div className="flex items-center justify-between rounded-panel border border-border/70 bg-card p-4">
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-medium">{user?.name || '—'}</p>
                <p className="m-0 truncate text-xs text-muted-foreground">{user?.email || '—'}</p>
              </div>
            </div>
            <form
              className="flex flex-col gap-3 rounded-panel border border-border/70 bg-card p-4"
              onSubmit={handleSavePassword}
              data-testid="settings-password-form"
            >
              <div>
                <p className="m-0 text-sm font-medium">{t('settingsPage.password')}</p>
                <p className="m-0 text-xs text-muted-foreground">{t('settingsPage.passwordHint')}</p>
              </div>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t('settingsPage.newPassword')}
                </span>
                <input
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={passwordInput}
                  onChange={event => {
                    setPasswordInput(event.target.value);
                    setPasswordError(null);
                    setPasswordSuccess(false);
                  }}
                  className="min-h-10 rounded-control border border-input bg-background px-3 text-sm transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-testid="settings-password-input"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t('settingsPage.confirmPassword')}
                </span>
                <input
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={passwordConfirmInput}
                  onChange={event => {
                    setPasswordConfirmInput(event.target.value);
                    setPasswordError(null);
                    setPasswordSuccess(false);
                  }}
                  className="min-h-10 rounded-control border border-input bg-background px-3 text-sm transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-testid="settings-password-confirm-input"
                />
              </label>
              {passwordError && (
                <p className="m-0 text-xs font-medium text-destructive" data-testid="settings-password-error">
                  {passwordError}
                </p>
              )}
              {passwordSuccess && (
                <p className="m-0 text-xs font-medium text-muted-foreground" data-testid="settings-password-success">
                  {t('settingsPage.passwordSaved')}
                </p>
              )}
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={savingPassword} data-testid="settings-password-save-btn">
                  {savingPassword ? '…' : t('settingsPage.savePassword')}
                </Button>
              </div>
            </form>
            {/* Logout lives in the sidebar footer, always visible — a second
                copy here was a duplicate control for the same action (D7). */}
          </div>
        )}

        {category === 'appearance' && (
          <div data-testid="settings-panel-appearance" className="flex flex-col gap-4">
            <h3 className="m-0 text-lg font-semibold">{t('settingsPage.appearance')}</h3>
            <div className="flex items-center justify-between rounded-panel border border-border/70 bg-card p-4">
              <span className="text-sm font-medium">{t('settingsPage.theme')}</span>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between rounded-panel border border-border/70 bg-card p-4">
              <span className="text-sm font-medium">{tc('appearance.accent')}</span>
              <AccentPicker side="bottom" variant="icon" />
            </div>
            <div className="flex items-center justify-between rounded-panel border border-border/70 bg-card p-4">
              <span className="text-sm font-medium">{t('settingsPage.language')}</span>
              <LanguageSwitcher />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-panel border border-border/70 bg-card p-4">
              <div>
                <span className="block text-sm font-medium">Density</span>
                <span className="text-xs text-muted-foreground">Choose roomier or information-dense task rows.</span>
              </div>
              <DensityToggle />
            </div>
          </div>
        )}

        {category === 'integrations' && (
          <div data-testid="settings-panel-integrations" className="flex flex-col gap-4">
            <div>
              <h3 className="m-0 text-lg font-semibold">{t('settingsPage.integrations')}</h3>
              <p className="m-0 mt-1 text-sm text-muted-foreground">{t('settingsPage.integrationsHint')}</p>
            </div>
            <TelegramConnectCard />
          </div>
        )}

        {category === 'google' && (
          <div data-testid="settings-panel-google" className="flex flex-col gap-4">
            <h3 className="m-0 text-lg font-semibold">{t('settingsPage.google')}</h3>
            <div className="flex items-center justify-between rounded-panel border border-border/70 bg-card p-4">
              <div>
                <p className="m-0 text-sm font-medium">{t('settingsPage.googleCalendar')}</p>
                <p className="m-0 text-xs text-muted-foreground">{t('settingsPage.googleCalendarHint')}</p>
              </div>
              <GoogleConnectButton />
            </div>
            <div className="rounded-panel border border-border/70 bg-card p-4">
              <GoogleDriveBackup gcalConnected={gcalConnected} onConnectGoogle={onConnectGoogle} />
            </div>
          </div>
        )}

        {category === 'data' && (
          <div data-testid="settings-panel-data" className="flex flex-col gap-4">
            <h3 className="m-0 text-lg font-semibold">{t('settingsPage.data')}</h3>
            <div className="flex items-center justify-between rounded-panel border border-border/70 bg-card p-4">
              <div>
                <p className="m-0 text-sm font-medium">{t('settingsPage.importTitle')}</p>
                <p className="m-0 text-xs text-muted-foreground">{t('settingsPage.importHint')}</p>
              </div>
              <Button variant="outline" onClick={onGoToImport} data-testid="settings-go-to-import">
                {t('sidebar.import')}
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-panel border border-border/70 bg-card p-4">
              <div>
                <p className="m-0 text-sm font-medium">{t('settingsPage.exportTitle')}</p>
                <p className="m-0 text-xs text-muted-foreground">{t('settingsPage.exportHint')}</p>
              </div>
              <Button variant="outline" onClick={onGoToExport} data-testid="settings-go-to-export">
                {t('sidebar.export')}
              </Button>
            </div>
          </div>
        )}

        {category === 'productivity' && (
          <div data-testid="settings-panel-productivity" className="flex flex-col gap-4">
            <h3 className="m-0 text-lg font-semibold">{t('settingsPage.productivity')}</h3>
            <div className="rounded-panel border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 flex items-center gap-2 text-sm font-medium">
                    <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {t('settingsPage.notifications')}
                  </p>
                  <p className="m-0 mt-1 text-xs text-muted-foreground">
                    {notificationStatus === 'unsupported'
                      ? t('settingsPage.notificationsUnsupported')
                      : notificationStatus === 'denied'
                        ? t('settingsPage.notificationsDenied')
                        : t('settingsPage.notificationsHint')}
                  </p>
                  {notificationError && (
                    <p className="m-0 mt-2 text-xs font-medium text-destructive" data-testid="notifications-error">
                      {notificationError}
                    </p>
                  )}
                </div>
                <Switch
                  checked={notificationStatus === 'subscribed'}
                  disabled={notificationBusy || notificationStatus === 'unsupported' || notificationStatus === 'denied'}
                  onCheckedChange={checked => { void handleToggleNotifications(checked); }}
                  aria-label={t('settingsPage.notifications')}
                  data-testid="notifications-toggle"
                />
              </div>
            </div>
            <div className="rounded-panel border border-border/70 bg-card p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="m-0 text-sm font-medium">{t('settingsPage.pomodoroWorkMinutes')}</p>
                    <p className="m-0 text-xs text-muted-foreground">{t('settingsPage.pomodoroWorkMinutesHint')}</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={workInput}
                    onChange={e => setWorkInput(e.target.value)}
                    onBlur={() => { const v = Math.max(1, Math.min(120, parseInt(workInput, 10) || 25)); setWorkInput(String(v)); }}
                    className="w-20 rounded-control border border-input bg-background px-2 py-1.5 text-right text-sm transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    data-testid="pomodoro-work-input"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="m-0 text-sm font-medium">{t('settingsPage.pomodoroBreakMinutes')}</p>
                    <p className="m-0 text-xs text-muted-foreground">{t('settingsPage.pomodoroBreakMinutesHint')}</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={breakInput}
                    onChange={e => setBreakInput(e.target.value)}
                    onBlur={() => { const v = Math.max(1, Math.min(60, parseInt(breakInput, 10) || 5)); setBreakInput(String(v)); }}
                    className="w-20 rounded-control border border-input bg-background px-2 py-1.5 text-right text-sm transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    data-testid="pomodoro-break-input"
                  />
                </div>
                {pomodoroDirty && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSavePomodoro}
                      disabled={saving}
                      data-testid="pomodoro-save-btn"
                    >
                      {saving ? '…' : tc('save')}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-panel border border-border/70 bg-card p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="m-0 text-sm font-medium">{t('settingsPage.workHoursPerDay')}</p>
                    <p className="m-0 text-xs text-muted-foreground">{t('settingsPage.workHoursPerDayHint')}</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={workHoursInput}
                    onChange={e => setWorkHoursInput(e.target.value)}
                    onBlur={() => { const v = Math.max(1, Math.min(24, parseInt(workHoursInput, 10) || 8)); setWorkHoursInput(String(v)); }}
                    className="w-20 rounded-control border border-input bg-background px-2 py-1.5 text-right text-sm transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    data-testid="work-hours-input"
                  />
                </div>
                {workHoursDirty && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSaveWorkHours}
                      disabled={savingWorkHours}
                      data-testid="work-hours-save-btn"
                    >
                      {savingWorkHours ? '…' : tc('save')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {category === 'about' && (
          <div data-testid="settings-panel-about" className="flex flex-col gap-2">
            <h3 className="m-0 text-lg font-semibold">{tc('app.title')}</h3>
            <p className="m-0 text-sm text-muted-foreground">{tc('app.description')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
