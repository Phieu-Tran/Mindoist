import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarPlus, X } from 'lucide-react';
import { useDialogA11y } from './ui/dialog';
import './CreateTaskDialog.css';

interface Props {
  open: boolean;
  date?: string;
  startTime?: string;
  endTime?: string;
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}

export function CreateTaskDialog({ open, date, startTime, endTime, onClose, onCreate }: Props) {
  const { t } = useTranslation('tasks');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogA11y<HTMLFormElement>({
    open,
    onClose,
    initialFocusRef: titleRef,
    closeOnEscape: !submitting,
  });

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setError('');
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onCreate(title.trim());
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('calendar.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="create-task-backdrop"
          className="create-task-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={event => {
            if (event.target === event.currentTarget && !submitting) onClose();
          }}
        >
          <motion.form
            ref={dialogRef}
            className="create-task-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
            onSubmit={submit}
            data-testid="create-task-dialog"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          >
            <header>
              <span className="create-task-dialog-icon" aria-hidden="true">
                <CalendarPlus className="h-4 w-4" />
              </span>
              <div>
                <p>{t('calendar.createEyebrow')}</p>
                <h2 id="create-task-title">{t('calendar.createTask')}</h2>
                {date && (
                  <time dateTime={startTime ? `${date}T${startTime}` : date}>
                    {startTime && endTime
                      ? t('calendar.selectedSlotWithRange', { date, startTime, endTime })
                      : startTime
                        ? t('calendar.selectedSlotWithTime', { date, time: startTime })
                        : t('calendar.selectedSlot', { date })}
                  </time>
                )}
              </div>
              <button type="button" onClick={onClose} disabled={submitting} aria-label={t('calendar.cancelCreate')}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <label htmlFor="create-task-title-input">
              <span>{t('calendar.taskTitle')}</span>
              <input
                ref={titleRef}
                id="create-task-title-input"
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={220}
                autoComplete="off"
                placeholder={t('calendar.taskTitlePlaceholder')}
              />
            </label>

            {error && <p className="create-task-error" role="alert">{error}</p>}

            <footer>
              <button type="button" onClick={onClose} disabled={submitting}>{t('calendar.cancelCreate')}</button>
              <button type="submit" className="is-primary" disabled={!title.trim() || submitting}>
                {submitting ? t('calendar.creatingTask') : t('calendar.createTask')}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
