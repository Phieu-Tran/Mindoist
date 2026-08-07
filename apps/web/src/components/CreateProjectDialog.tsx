import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { BriefcaseBusiness, CalendarCheck2, Heart, Shapes, X, Check } from 'lucide-react';
import type { CreateProjectRequest, ProjectType, Area } from '@mindoist/shared/types';
import { cn } from '@/lib/utils';
import { useDialogA11y } from './ui/dialog';
import './CreateProjectDialog.css';

interface Props {
  open: boolean;
  parentId?: string;
  parentName?: string;
  onClose: () => void;
  onCreate: (request: CreateProjectRequest) => Promise<void>;
}

const TEMPLATES: Array<{
  type: ProjectType;
  icon: typeof CalendarCheck2;
  columns: string[];
}> = [
  { type: 'DAILY_LOG', icon: CalendarCheck2, columns: ['TODO', 'Doing', 'Done'] },
  { type: 'JOB', icon: BriefcaseBusiness, columns: ['Applied', 'Screen', 'Interview', 'Offer', 'Rejected'] },
  { type: 'PERSONAL', icon: Heart, columns: ['Backlog', 'This Week', 'Today', 'Done'] },
  { type: 'CUSTOM', icon: Shapes, columns: ['Backlog', 'In progress', 'Done'] },
];

const PROJECT_COLORS = ['indigo', 'ocean', 'jade', 'rose', 'amber'] as const;

export function CreateProjectDialog({ open, parentId, parentName, onClose, onCreate }: Props) {
  const { t } = useTranslation('tasks');
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('PERSONAL');
  const [color, setColor] = useState<string>('indigo');
  const [customColumns, setCustomColumns] = useState('Backlog, In progress, Done');
  const [areaId, setAreaId] = useState<string>('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({
    open,
    onClose,
    initialFocusRef: nameRef,
    closeOnEscape: !submitting,
  });

  useEffect(() => {
    if (!open) return;
    setName('');
    setType('PERSONAL');
    setColor('indigo');
    setAreaId('');
    setError('');
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/areas', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (d.success) setAreas(d.data); })
        .catch(() => {});
    }
  }, [open]);

  const parsedCustomColumns = useMemo(() => customColumns
    .split(',')
    .map(column => column.trim())
    .filter((column, index, all) => column && all.indexOf(column) === index)
    .slice(0, 12), [customColumns]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || (type === 'CUSTOM' && !parsedCustomColumns.length)) return;
    setSubmitting(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        type,
        color,
        parentId,
        areaId: areaId || null,
        customColumns: type === 'CUSTOM' ? parsedCustomColumns : undefined,
      });
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('projects.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="create-project-backdrop"
          className="create-project-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={event => {
            if (event.target === event.currentTarget && !submitting) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            className="create-project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            data-testid="create-project-dialog"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          >
            <header>
              <div>
                <span>{parentId ? t('projects.subprojectEyebrow') : t('projects.projectEyebrow')}</span>
                <h2 id="create-project-title">
                  {parentId ? t('projects.createSubprojectTitle', { name: parentName }) : t('projects.createProjectTitle')}
                </h2>
              </div>
              <button type="button" onClick={onClose} disabled={submitting} aria-label={t('projects.cancel')}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <form onSubmit={submit}>
              <label className="create-project-field" htmlFor="create-project-name">
                <span>{t('projects.name')}</span>
                <input
                  ref={nameRef}
                  id="create-project-name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  maxLength={120}
                  placeholder={type === 'DAILY_LOG' ? t('projects.dailyNamePlaceholder') : t('projects.namePlaceholder')}
                  autoComplete="off"
                />
              </label>

              <fieldset className="create-project-templates">
                <legend>{t('projects.chooseTemplate')}</legend>
                <div>
                  {TEMPLATES.map(template => {
                    const Icon = template.icon;
                    return (
                      <button
                        key={template.type}
                        type="button"
                        className={cn(type === template.type && 'is-selected')}
                        onClick={() => setType(template.type)}
                        aria-pressed={type === template.type}
                      >
                        <span className="create-project-template-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                        <strong>{t(`projects.templates.${template.type}.name`)}</strong>
                        <small>{t(`projects.templates.${template.type}.description`)}</small>
                        <em>{template.columns.join(' · ')}</em>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {type === 'CUSTOM' && (
                <label className="create-project-field" htmlFor="create-project-columns">
                  <span>{t('projects.customColumns')}</span>
                  <input
                    id="create-project-columns"
                    value={customColumns}
                    onChange={event => setCustomColumns(event.target.value)}
                    placeholder={t('projects.customColumnsPlaceholder')}
                  />
                  <small>{t('projects.customColumnsHint')}</small>
                </label>
              )}

              {areas.length > 0 && (
                <label className="create-project-field" htmlFor="create-project-area">
                  <span>{t('projects.area', 'Area')}</span>
                  <select
                    id="create-project-area"
                    value={areaId}
                    onChange={event => setAreaId(event.target.value)}
                  >
                    <option value="">{t('projects.noArea', 'No area')}</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <fieldset className="create-project-colors">
                <legend>{t('projects.color')}</legend>
                <div>
                  {PROJECT_COLORS.map(projectColor => (
                    <button
                      key={projectColor}
                      type="button"
                      className={cn(`project-color-${projectColor}`, color === projectColor && 'is-selected')}
                      onClick={() => setColor(projectColor)}
                      aria-label={t(`projects.colors.${projectColor}`)}
                      aria-pressed={color === projectColor}
                    >
                      {color === projectColor && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </fieldset>

              {error && <p className="create-project-error" role="alert">{error}</p>}

              <footer>
                <button type="button" onClick={onClose} disabled={submitting}>{t('projects.cancel')}</button>
                <button
                  type="submit"
                  className="is-primary"
                  disabled={!name.trim() || submitting || (type === 'CUSTOM' && !parsedCustomColumns.length)}
                >
                  {submitting ? t('projects.creating') : t('projects.create')}
                </button>
              </footer>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ProjectTypeIcon({ type, className }: { type?: ProjectType; className?: string }) {
  const template = TEMPLATES.find(item => item.type === type) || TEMPLATES[3];
  const Icon = template.icon;
  return <Icon className={className} aria-hidden="true" />;
}
