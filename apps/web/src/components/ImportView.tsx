import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, CheckCircle, AlertCircle, ArrowRight, FolderOpen, Tag, AlertTriangle, ChevronLeft, Clock } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

type ImportSource = 'mindoist-json' | 'ticktick' | 'todoist' | 'anydo' | 'google-tasks';

const IMPORT_SOURCES: { id: ImportSource; label: string; available: boolean }[] = [
  { id: 'mindoist-json', label: 'Mindoist JSON', available: true },
  { id: 'ticktick', label: 'TickTick', available: true },
  { id: 'todoist', label: 'Todoist', available: false },
  { id: 'anydo', label: 'Any.do', available: false },
  { id: 'google-tasks', label: 'Google Tasks', available: false },
];

interface ParsedTask {
  title: string;
  content: string;
  isChecklist: boolean;
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  rrule: string | null;
  priority: number | null;
  isCompleted: boolean;
  listName: string;
  tags: string[];
}

interface ImportPreview {
  tasks: ParsedTask[];
  projects: string[];
  tags: string[];
  stats: {
    total: number;
    completed: number;
    recurring: number;
    checklists: number;
    withDueDate: number;
  };
}

interface ImportResult {
  imported: number;
  projectsCreated: number;
  tagsCreated: number;
  countdownsImported?: number;
}

interface Props {
  onImportComplete?: () => void;
}

export function ImportView({ onImportComplete }: Props) {
  const { t } = useTranslation('tasks');
  const [source, setSource] = useState<ImportSource | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(null);
      setResult(null);
      setError(null);
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const path = source === 'mindoist-json' ? 'mindoist' : 'ticktick';
      const res = await fetch(`${API}/import/${path}/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error(source === 'mindoist-json' ? 'Failed to parse JSON' : 'Failed to parse CSV');
      const data: ImportPreview = await res.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : source === 'mindoist-json' ? 'Failed to parse JSON' : 'Failed to parse CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const path = source === 'mindoist-json' ? 'mindoist' : 'ticktick';
      const res = await fetch(`${API}/import/${path}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to import');
      const data: ImportResult = await res.json();
      setResult(data);
      // Imported tasks land in the shared task list right away (it refetches
      // on view change), but new projects/tags created by the import don't —
      // those hooks only fetch once on mount, so the sidebar would otherwise
      // keep showing the pre-import project/tag list until a full reload.
      onImportComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import');
    } finally {
      setLoading(false);
    }
  };

  const priorityLabel = (p: number | null) => {
    if (p === 1) return 'P1';
    if (p === 2) return 'P2';
    if (p === 3) return 'P3';
    if (p === 4) return 'P4';
    return '—';
  };

  const priorityColor = (p: number | null) => {
    if (p === 1) return 'text-[var(--color-p1)]';
    if (p === 2) return 'text-[var(--color-p2)]';
    if (p === 3) return 'text-[var(--color-p3)]';
    if (p === 4) return 'text-[var(--color-p4)]';
    return 'text-muted-foreground';
  };

  if (source === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
            {t('import.sourcePicker.title')}
          </h2>
          <p className="text-[var(--color-muted-foreground)] mt-2 max-w-md">
            {t('import.sourcePicker.description')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {IMPORT_SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className="flex flex-col items-center justify-center gap-2 rounded-panel border border-border/70 p-4 text-foreground transition-colors hover:border-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              data-testid={`import-source-${s.id}`}
            >
              {!s.available && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--color-secondary)] text-[var(--color-muted-foreground)] text-[10px] rounded-full">
                  <Clock className="w-2.5 h-2.5" />
                  {t('import.sourcePicker.comingSoonBadge')}
                </span>
              )}
              <span className="font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (source !== 'ticktick' && source !== 'mindoist-json') {
    const sourceLabel = IMPORT_SOURCES.find((s) => s.id === source)?.label ?? source;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="w-16 h-16 rounded-full bg-[var(--color-secondary)] flex items-center justify-center">
          <Clock className="w-8 h-8 text-[var(--color-muted-foreground)]" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
            {t('import.sourcePicker.comingSoonTitle', { source: sourceLabel })}
          </h2>
          <p className="text-[var(--color-muted-foreground)] mt-2 max-w-md">
            {t('import.sourcePicker.comingSoonDesc')}
          </p>
        </div>
        <button
          onClick={() => setSource(null)}
          className="flex items-center gap-1 rounded-control border border-input px-4 py-2 text-foreground transition-colors hover:border-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('import.sourcePicker.backToSources')}
        </button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="w-16 h-16 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
            {t('import.doneTitle')}
          </h2>
          <p className="text-[var(--color-muted-foreground)] mt-2">
            {result.imported} {t('import.doneDesc')}
          </p>
          {result.projectsCreated > 0 && (
            <p className="text-[var(--color-muted-foreground)]">
              + {result.projectsCreated} {t('import.projectsCreated')}
            </p>
          )}
          {result.tagsCreated > 0 && (
            <p className="text-[var(--color-muted-foreground)]">
              + {result.tagsCreated} {t('import.tagsCreated')}
            </p>
          )}
          {(result.countdownsImported ?? 0) > 0 && (
            <p className="text-[var(--color-muted-foreground)]">
              + {result.countdownsImported} {t('import.countdownsImported')}
            </p>
          )}
        </div>
        <button
          onClick={() => { setResult(null); setPreview(null); setFile(null); }}
          className="px-4 py-2 rounded-control bg-primary text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t('import.importAnother')}
        </button>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
              {t('import.previewTitle')}
            </h2>
            <button
              onClick={() => { setPreview(null); setFile(null); }}
              className="text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              {t('import.back')}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-[var(--color-muted-foreground)]" />
              <span className="text-[var(--color-muted-foreground)]">{t('import.total')}:</span>
              <span className="font-medium text-[var(--color-foreground)]">{preview.stats.total}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-[var(--color-muted-foreground)]">{t('import.completed')}:</span>
              <span className="font-medium text-[var(--color-foreground)]">{preview.stats.completed}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ArrowRight className="w-4 h-4 text-[var(--color-primary)]" />
              <span className="text-[var(--color-muted-foreground)]">{t('import.recurring')}:</span>
              <span className="font-medium text-[var(--color-foreground)]">{preview.stats.recurring}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="text-[var(--color-muted-foreground)]">{t('import.checklists')}:</span>
              <span className="font-medium text-[var(--color-foreground)]">{preview.stats.checklists}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FolderOpen className="w-4 h-4 text-[var(--color-muted-foreground)]" />
              <span className="text-[var(--color-muted-foreground)]">{t('import.withDueDate')}:</span>
              <span className="font-medium text-[var(--color-foreground)]">{preview.stats.withDueDate}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-[var(--color-muted-foreground)]">{t('import.projectsLabel')}:</span>
            {preview.projects.map((p) => (
              <span key={p} className="px-2 py-0.5 bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] text-xs rounded-full">
                {p}
              </span>
            ))}
          </div>
          {preview.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs text-[var(--color-muted-foreground)]">{t('import.tagsLabel')}:</span>
              {preview.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] text-xs rounded-full flex items-center gap-1">
                  <Tag className="w-3 h-3" />{tag}
                </span>
              ))}
            </div>
          )}
          {preview.stats.recurring > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
              <AlertTriangle className="w-3 h-3" />
              {t('import.recurringNote')}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-background)] border-b border-[var(--color-border)]">
              <tr>
                <th className="text-left p-3 font-medium text-[var(--color-muted-foreground)]">{t('import.taskTitle')}</th>
                <th className="text-left p-3 font-medium text-[var(--color-muted-foreground)]">{t('import.project')}</th>
                <th className="text-left p-3 font-medium text-[var(--color-muted-foreground)]">{t('import.priority')}</th>
                <th className="text-left p-3 font-medium text-[var(--color-muted-foreground)]">{t('import.dueDate')}</th>
                <th className="text-left p-3 font-medium text-[var(--color-muted-foreground)]">{t('import.status')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.tasks.slice(0, 100).map((task, i) => (
                <tr key={i} className="border-b border-[var(--color-border)]">
                  <td className="p-3">
                    <span className="text-[var(--color-foreground)]">{task.title}</span>
                    {task.isChecklist && (
                      <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">[checklist]</span>
                    )}
                    {task.rrule && (
                      <span className="ml-1 text-xs text-[var(--color-primary)]">[recurring]</span>
                    )}
                  </td>
                  <td className="p-3 text-[var(--color-muted-foreground)]">{task.listName}</td>
                  <td className={`p-3 font-medium ${priorityColor(task.priority)}`}>{priorityLabel(task.priority)}</td>
                  <td className="p-3 text-[var(--color-muted-foreground)]">{task.dueDate || '—'}</td>
                  <td className="p-3">
                    {task.isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <span className="w-4 h-4 block rounded-full border border-[var(--color-border)]" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.tasks.length > 100 && (
            <p className="text-center text-sm text-[var(--color-muted-foreground)] py-4">
              {t('import.showing100', { total: preview.tasks.length })}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-3">
          <button
            onClick={() => { setPreview(null); setFile(null); }}
            className="px-4 py-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            {t('import.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t('import.importing') : t('import.confirmButton')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <button
        onClick={() => setSource(null)}
        className="self-start flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="w-4 h-4" />
        {t('import.sourcePicker.backToSources')}
      </button>
      <div className="w-16 h-16 rounded-full bg-[var(--color-secondary)] flex items-center justify-center">
        <Upload className="w-8 h-8 text-[var(--color-muted-foreground)]" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
          {t(source === 'mindoist-json' ? 'import.mindoist.title' : 'import.title')}
        </h2>
        <p className="text-[var(--color-muted-foreground)] mt-2 max-w-md">
          {t(source === 'mindoist-json' ? 'import.mindoist.description' : 'import.description')}
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={source === 'mindoist-json' ? '.json,application/json' : '.csv'}
        onChange={handleFileChange}
        className="hidden"
        data-testid="import-file-input"
      />

      <button
        onClick={() => fileRef.current?.click()}
        className="rounded-control border border-input px-4 py-2 text-foreground transition-colors hover:border-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {file ? file.name : t(source === 'mindoist-json' ? 'import.mindoist.chooseFile' : 'import.chooseFile')}
      </button>

      {file && (
        <button
          onClick={handlePreview}
          disabled={loading}
          className="px-6 py-2 rounded-control bg-primary text-primary-foreground font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t('import.parsing') : t('import.previewButton')}
        </button>
      )}

      {error && (
        <p className="text-[var(--color-error)] text-sm">{error}</p>
      )}

      <div className="text-xs text-[var(--color-muted-foreground)] mt-4 max-w-md text-center">
        {t(source === 'mindoist-json' ? 'import.mindoist.hint' : 'import.hint')}
      </div>
    </div>
  );
}
