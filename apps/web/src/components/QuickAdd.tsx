import { useState, useEffect, useMemo, type FormEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { parseQuickAdd } from '@mindoist/shared/nlparse';
import type { ParsedQuickAdd } from '@mindoist/shared/nlparse';
import { Calendar, Clock, Flag, Timer, FolderOpen, Bell, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Input } from './ui/input';

interface Props {
  onAdd: (req: ParsedQuickAdd) => void;
  now?: Date;
  locale?: 'en' | 'vi';
}

// Count how many structured fields a parse pulled out of the raw text — used to
// pick between the 'en' and 'vi' parsers when the caller doesn't pin a locale,
// since the UI's display language doesn't tell us what language the user typed in.
function parseRichness(p: ParsedQuickAdd): number {
  return [p.dueDate, p.dueTime, p.priority, p.durationMin, p.projectId, p.reminderOffsetMin].filter(
    (v) => v !== undefined
  ).length;
}

export function QuickAdd({ onAdd, now, locale }: Props) {
  const { i18n, t } = useTranslation('tasks');
  const uiLocale = i18n.language?.startsWith('vi') ? 'vi' : 'en';

  // Sync i18n language when locale prop is explicitly provided
  useEffect(() => {
    if (locale) i18n.changeLanguage(locale);
  }, [locale, i18n]);

  const [input, setInput] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [parsed, setParsed] = useState<ParsedQuickAdd | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (text) { setInput(text); setDismissed(false); }
    };
    window.addEventListener('mindoist:quickadd', handler);
    return () => window.removeEventListener('mindoist:quickadd', handler);
  }, []);

  const effectiveNow = useMemo(() => now ?? new Date(), [now]);

  // When no locale is pinned (normal app usage, not tests), the parser must go
  // by what the user actually typed, not by the UI's display language — a
  // bilingual user can leave the app in English and still type Vietnamese
  // phrases like "ngày mai" and vice versa. Parse with both and keep whichever
  // extracted more structured fields; on a tie (e.g. plain title, no date/time
  // keywords), fall back to the UI language for backward-compatible behavior.
  const parseBest = (text: string): ParsedQuickAdd => {
    if (locale) return parseQuickAdd(text, { locale, now: effectiveNow });
    const en = parseQuickAdd(text, { locale: 'en', now: effectiveNow });
    const vi = parseQuickAdd(text, { locale: 'vi', now: effectiveNow });
    const enScore = parseRichness(en);
    const viScore = parseRichness(vi);
    if (enScore === viScore) return uiLocale === 'vi' ? vi : en;
    return viScore > enScore ? vi : en;
  };

  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed || dismissed) {
      setParsed(null);
      setShowPreview(false);
      return;
    }
    const result = parseBest(trimmed);
    setParsed(result);
    setShowPreview(!!(result.dueDate || result.dueTime || result.priority || result.durationMin || result.projectId || result.reminderOffsetMin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, dismissed, locale, uiLocale, effectiveNow]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (dismissed) setDismissed(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    if (dismissed) {
      onAdd({ title: trimmed });
    } else {
      const result = parseBest(trimmed);
      onAdd(result);
    }
    setInput('');
    setDismissed(false);
  };

  const dismissPreview = (e: MouseEvent) => {
    e.stopPropagation();
    setShowPreview(false);
    setDismissed(true);
  };

  return (
    <div className="w-full" data-testid="quick-add">
      {/* A quiet row at rest — borderless, muted plus icon — that only opens
          up (border, brighter icon) on focus, per DESIGN.md §10.4: no input
          flush against a bold square button. */}
      <form
        onSubmit={handleSubmit}
        className="group flex items-center gap-2 rounded-control border border-transparent px-2 transition-colors hover:bg-muted/40 focus-within:border-border focus-within:bg-background"
      >
        <button
          type="submit"
          data-testid="add-task-btn"
          aria-label={t('quickAdd.add')}
          disabled={!input.trim()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:text-primary disabled:cursor-default group-focus-within:text-primary/70"
        >
          <Plus className="h-4 w-4" />
        </button>
        <Input
          data-testid="add-task-input"
          value={input}
          onChange={handleChange}
          placeholder={t('quickAdd.placeholder')}
          className="h-9 flex-1 border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </form>

      {showPreview && parsed && (
        <div
          data-testid="quick-add-preview"
          className={cn(
            "mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-3 text-xs",
            dismissed && "opacity-50"
          )}
          aria-label={t('quickAdd.preview')}
        >
          <span className="text-muted-foreground">{t('quickAdd.preview')}:</span>
          {parsed.dueDate && (
            <Badge variant="outline" data-testid="preview-due-date" className="gap-1">
              <Calendar className="h-3 w-3" /> {parsed.dueDate}
            </Badge>
          )}
          {parsed.dueTime && (
            <Badge variant="outline" data-testid="preview-due-time" className="gap-1">
              <Clock className="h-3 w-3" /> {parsed.dueTime}
            </Badge>
          )}
          {parsed.priority && (
            <Badge variant="secondary" data-testid="preview-priority" className="gap-1">
              <Flag className="h-3 w-3" /> {t('quickAdd.priority')} {parsed.priority}
            </Badge>
          )}
          {parsed.durationMin && (
            <Badge variant="outline" data-testid="preview-duration" className="gap-1">
              <Timer className="h-3 w-3" /> {parsed.durationMin}m
            </Badge>
          )}
          {parsed.projectId && (
            <Badge variant="outline" data-testid="preview-project" className="gap-1">
              <FolderOpen className="h-3 w-3" /> #{parsed.projectId}
            </Badge>
          )}
          {parsed.reminderOffsetMin && (
            <Badge variant="outline" data-testid="preview-reminder" className="gap-1">
              <Bell className="h-3 w-3" /> {parsed.reminderOffsetMin}m {t('quickAdd.before')}
            </Badge>
          )}
          <button
            type="button"
            data-testid="dismiss-preview"
            onClick={dismissPreview}
            className="inline-flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.90]"
            aria-label={t('quickAdd.dismissPreview')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
