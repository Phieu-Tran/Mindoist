import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, ExternalLink, FolderOpen, NotebookTabs } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import {
  buildObsidianOpenVaultUri,
  isObsidianConfigured,
  normalizeObsidianSettings,
  renderObsidianNotePath,
  validateObsidianSettings,
  type ObsidianSettings,
  type ObsidianSettingsValidationError,
} from '@/lib/obsidian-settings';

interface Props {
  settings: ObsidianSettings;
  onSave: (settings: ObsidianSettings) => void;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentWeekStartKey() {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

function openCustomUri(uri: string) {
  const link = document.createElement('a');
  link.href = uri;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function ObsidianSettingsCard({ settings, onSave }: Props) {
  const { t } = useTranslation('tasks');
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState<ObsidianSettingsValidationError | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const normalizedDraft = useMemo(() => normalizeObsidianSettings(draft), [draft]);
  const previewPath = renderObsidianNotePath(normalizedDraft, { kind: 'month', key: currentMonthKey() });
  const weeklyPreviewPath = renderObsidianNotePath(normalizedDraft, { kind: 'week', key: currentWeekStartKey() });
  const configured = isObsidianConfigured(settings);

  const updateDraft = (next: Partial<ObsidianSettings>) => {
    const value = { ...draft, ...next };
    setDraft(value);
    setSaved(false);
    if (error) setError(validateObsidianSettings(value));
  };

  const validateDraft = () => {
    const nextError = validateObsidianSettings(draft);
    setError(nextError);
    return nextError;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateDraft();
    if (nextError) {
      const fieldIds: Record<keyof ObsidianSettings, string> = {
        vault: 'obsidian-vault',
        folder: 'obsidian-folder',
        filenameTemplate: 'obsidian-filename',
        weeklyFilenameTemplate: 'obsidian-weekly-filename',
      };
      document.getElementById(fieldIds[nextError.field])?.focus();
      return;
    }
    const normalized = normalizeObsidianSettings(draft);
    onSave(normalized);
    setDraft(normalized);
    setSaved(true);
  };

  const handleOpenVault = () => {
    const vault = draft.vault.trim();
    if (!vault) {
      setError({ field: 'vault', code: 'vaultRequired' });
      return;
    }
    openCustomUri(buildObsidianOpenVaultUri(vault));
  };

  const inputClassName = 'min-h-[44px] w-full rounded-control border border-input bg-background px-3 text-base text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-sm';
  const errorId = error ? `obsidian-${error.field}-error` : undefined;
  const errorMessage = error
    ? t(`settingsPage.obsidianErrors.${error.code}`, {
      monthToken: '{{yyyy-MM}}',
      weekToken: '{{weekStart}}',
    })
    : null;

  return (
    <form
      className="flex flex-col gap-4 rounded-panel border border-border/70 bg-card p-4 sm:p-5"
      onSubmit={handleSubmit}
      data-testid="obsidian-settings-form"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
            <NotebookTabs className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h4 className="m-0 text-base font-semibold">{t('settingsPage.obsidianTitle')}</h4>
            <p className="m-0 mt-1 text-sm text-muted-foreground">{t('settingsPage.obsidianDescription')}</p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
            configured ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
          data-testid="obsidian-settings-status"
        >
          {configured && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
          {configured ? t('settingsPage.obsidianConfigured') : t('settingsPage.obsidianNotConfigured')}
        </span>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-1.5" htmlFor="obsidian-vault">
          <span className="text-sm font-semibold text-foreground">
            {t('settingsPage.obsidianVault')} <span className="text-destructive" aria-hidden="true">*</span>
          </span>
          <input
            id="obsidian-vault"
            data-testid="obsidian-vault-input"
            value={draft.vault}
            onChange={event => updateDraft({ vault: event.target.value })}
            onBlur={validateDraft}
            placeholder="Hiếu - Personal"
            autoComplete="off"
            aria-required="true"
            aria-invalid={error?.field === 'vault' || undefined}
            aria-describedby={error?.field === 'vault' ? errorId : 'obsidian-vault-help'}
            className={inputClassName}
          />
          <span id="obsidian-vault-help" className="text-sm text-muted-foreground">
            {t('settingsPage.obsidianVaultHint')}
          </span>
          {error?.field === 'vault' && (
            <span id={errorId} className="text-sm font-medium text-destructive" role="alert">{errorMessage}</span>
          )}
        </label>

        <label className="grid gap-1.5" htmlFor="obsidian-folder">
          <span className="text-sm font-semibold text-foreground">{t('settingsPage.obsidianFolder')}</span>
          <input
            id="obsidian-folder"
            data-testid="obsidian-folder-input"
            value={draft.folder}
            onChange={event => updateDraft({ folder: event.target.value })}
            onBlur={validateDraft}
            placeholder="03_Project/Mindoist"
            autoComplete="off"
            aria-invalid={error?.field === 'folder' || undefined}
            aria-describedby={error?.field === 'folder' ? errorId : 'obsidian-folder-help'}
            className={inputClassName}
          />
          <span id="obsidian-folder-help" className="text-sm text-muted-foreground">
            {t('settingsPage.obsidianFolderHint')}
          </span>
          {error?.field === 'folder' && (
            <span id={errorId} className="text-sm font-medium text-destructive" role="alert">{errorMessage}</span>
          )}
        </label>

        <label className="grid gap-1.5" htmlFor="obsidian-filename">
          <span className="text-sm font-semibold text-foreground">
            {t('settingsPage.obsidianFilename')} <span className="text-destructive" aria-hidden="true">*</span>
          </span>
          <input
            id="obsidian-filename"
            data-testid="obsidian-filename-input"
            value={draft.filenameTemplate}
            onChange={event => updateDraft({ filenameTemplate: event.target.value })}
            onBlur={validateDraft}
            placeholder="Tổng kết Mindoist {{yyyy-MM}}"
            autoComplete="off"
            aria-required="true"
            aria-invalid={error?.field === 'filenameTemplate' || undefined}
            aria-describedby={error?.field === 'filenameTemplate' ? errorId : 'obsidian-filename-help'}
            className={inputClassName}
          />
          <span id="obsidian-filename-help" className="text-sm text-muted-foreground">
            {t('settingsPage.obsidianFilenameHint', { monthToken: '{{yyyy-MM}}' })}
          </span>
          {error?.field === 'filenameTemplate' && (
            <span id={errorId} className="text-sm font-medium text-destructive" role="alert">{errorMessage}</span>
          )}
        </label>

        <label className="grid gap-1.5" htmlFor="obsidian-weekly-filename">
          <span className="text-sm font-semibold text-foreground">
            {t('settingsPage.obsidianWeeklyFilename')} <span className="text-destructive" aria-hidden="true">*</span>
          </span>
          <input
            id="obsidian-weekly-filename"
            data-testid="obsidian-weekly-filename-input"
            value={draft.weeklyFilenameTemplate}
            onChange={event => updateDraft({ weeklyFilenameTemplate: event.target.value })}
            onBlur={validateDraft}
            placeholder="Tổng kết tuần {{weekStart}}"
            autoComplete="off"
            aria-required="true"
            aria-invalid={error?.field === 'weeklyFilenameTemplate' || undefined}
            aria-describedby={error?.field === 'weeklyFilenameTemplate' ? errorId : 'obsidian-weekly-filename-help'}
            className={inputClassName}
          />
          <span id="obsidian-weekly-filename-help" className="text-sm text-muted-foreground">
            {t('settingsPage.obsidianWeeklyFilenameHint', { weekToken: '{{weekStart}}' })}
          </span>
          {error?.field === 'weeklyFilenameTemplate' && (
            <span id={errorId} className="text-sm font-medium text-destructive" role="alert">{errorMessage}</span>
          )}
        </label>
      </div>

      <div className="rounded-control border border-border/70 bg-muted/40 p-3" aria-live="polite">
        <p className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
          <FolderOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('settingsPage.obsidianPreview')}
        </p>
        <div className="mt-2 grid gap-1.5">
          <output className="block break-all font-mono text-sm text-muted-foreground" data-testid="obsidian-path-preview">
            {t('settingsPage.obsidianMonthlyShort')}: {normalizedDraft.vault || t('settingsPage.obsidianVaultPlaceholder')} / {previewPath}
          </output>
          <output className="block break-all font-mono text-sm text-muted-foreground" data-testid="obsidian-weekly-path-preview">
            {t('settingsPage.obsidianWeeklyShort')}: {normalizedDraft.vault || t('settingsPage.obsidianVaultPlaceholder')} / {weeklyPreviewPath}
          </output>
        </div>
      </div>

      <p className="m-0 text-sm text-muted-foreground">{t('settingsPage.obsidianLocalOnly')}</p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px]"
          onClick={handleOpenVault}
          data-testid="obsidian-open-vault"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t('settingsPage.obsidianOpenVault')}
        </Button>
        <div className="flex min-h-11 items-center justify-end gap-3">
          {saved && (
            <span className="text-sm font-medium text-primary" role="status" data-testid="obsidian-settings-saved">
              {t('settingsPage.obsidianSaved')}
            </span>
          )}
          <Button type="submit" className="min-h-[44px]" data-testid="obsidian-settings-save">
            {t('settingsPage.obsidianSave')}
          </Button>
        </div>
      </div>
    </form>
  );
}
