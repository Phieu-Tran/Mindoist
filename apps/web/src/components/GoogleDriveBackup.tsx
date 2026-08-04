import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Download, Trash2, RefreshCw, Cloud, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useDriveBackups } from '../hooks/useApi';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

interface Props {
  gcalConnected: boolean;
  onConnectGoogle: () => void;
}

export function GoogleDriveBackup({ gcalConnected, onConnectGoogle }: Props) {
  const { t } = useTranslation('tasks');
  const { backups, loading, createBackup, restoreBackup, deleteBackup } = useDriveBackups(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const handleBackup = async () => {
    setBackingUp(true);
    setMessage(null);
    try {
      const result = await createBackup();
      setMessage({ type: 'success', text: t('drive.backupSuccess', { size: formatBytes(result.sizeBytes) }) });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : t('drive.backupError') });
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async (fileId: string) => {
    setRestoringId(fileId);
    setMessage(null);
    setConfirmRestore(null);
    try {
      const result = await restoreBackup(fileId);
      setMessage({
        type: 'success',
        text: t('drive.restoreSuccess', {
          tasks: result.tasks,
          projects: result.projects,
        }),
      });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : t('drive.restoreError') });
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (fileId: string) => {
    setDeletingId(fileId);
    setMessage(null);
    try {
      await deleteBackup(fileId);
      setMessage({ type: 'success', text: t('drive.deleteSuccess') });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : t('drive.deleteError') });
    } finally {
      setDeletingId(null);
    }
  };

  if (!gcalConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Cloud className="h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold m-0">{t('drive.connectRequired')}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t('drive.connectDescription')}</p>
        </div>
        <Button onClick={onConnectGoogle} className="gap-2" data-testid="drive-connect-button">
          <Cloud className="h-4 w-4" />
          {t('drive.connectGoogle')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold m-0 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            {t('drive.title')}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{t('drive.description')}</p>
        </div>
        <Button
          onClick={handleBackup}
          disabled={backingUp}
          className="gap-2 shrink-0"
          data-testid="drive-backup-button"
        >
          {backingUp ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {backingUp ? t('drive.backingUp') : t('drive.backupNow')}
        </Button>
      </div>

      {/* Message */}
      {message && (
        <div
          role="alert"
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
              : 'bg-destructive/10 text-destructive'
          }`}
          data-testid="drive-message"
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Backup list */}
      <div>
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t('drive.backupHistory')}
        </h4>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('drive.loading')}
          </div>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4" data-testid="drive-no-backups">
            {t('drive.noBackups')}
          </p>
        ) : (
          <div className="flex flex-col gap-2" data-testid="drive-backup-list">
            {backups.map(backup => (
              <div
                key={backup.fileId}
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted/50 transition-colors"
                data-testid={`drive-backup-${backup.fileId}`}
              >
                <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate m-0">{backup.fileName}</p>
                  <p className="text-xs text-muted-foreground m-0">
                    {formatBytes(backup.sizeBytes)} · {formatDate(backup.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {confirmRestore === backup.fileId ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRestore(backup.fileId)}
                        disabled={restoringId === backup.fileId}
                        data-testid={`drive-restore-confirm-${backup.fileId}`}
                      >
                        {restoringId === backup.fileId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          t('drive.confirmRestore')
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRestore(null)}
                      >
                        {t('drive.cancel')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRestore(backup.fileId)}
                        disabled={restoringId !== null || deletingId !== null}
                        className="gap-1"
                        data-testid={`drive-restore-${backup.fileId}`}
                      >
                        <RefreshCw className="h-3 w-3" />
                        {t('drive.restore')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(backup.fileId)}
                        disabled={restoringId !== null || deletingId !== null}
                        className="gap-1 text-destructive hover:text-destructive"
                        data-testid={`drive-delete-${backup.fileId}`}
                      >
                        {deletingId === backup.fileId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
