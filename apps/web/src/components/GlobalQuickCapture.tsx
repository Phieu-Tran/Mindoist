import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Command } from 'lucide-react';
import { parseQuickAdd } from '@mindoist/shared/nlparse';
import type { ParsedQuickAdd } from '@mindoist/shared/nlparse';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface Props {
  onAdd: (req: ParsedQuickAdd) => void;
  locale?: 'en' | 'vi';
}

/**
 * B2.26 — global quick-capture console: Cmd/Ctrl+K opens a small overlay
 * from ANY view (unlike the existing "Q" shortcut, which only focuses the
 * Quick Add input already mounted in the current view — a no-op on views
 * like Calendar/Settings/Summary that don't render one). Optional per the
 * roadmap (lower priority than Quick Add itself), but still a real,
 * reachable feature — hand-rolled single-input dialog with a focus trap,
 * same pattern as TaskDetail's complete-parent confirm (B2.6), rather than
 * pulling in a command-palette library for one text field.
 */
export function GlobalQuickCapture({ onAdd, locale }: Props) {
  const { i18n, t } = useTranslation('tasks');
  const effectiveLocale = locale ?? (i18n.language?.startsWith('vi') ? 'vi' : 'en');

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<Element | null>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        triggerElementRef.current = document.activeElement;
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const openCapture = () => {
      triggerElementRef.current = document.activeElement;
      setOpen(true);
    };
    window.addEventListener('mindoist:global-capture', openCapture);
    return () => window.removeEventListener('mindoist:global-capture', openCapture);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>('input, button');
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    first?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      (triggerElementRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onAdd(parseQuickAdd(trimmed, { locale: effectiveLocale, now: new Date() }));
    setInput('');
    setOpen(false);
  }, [input, effectiveLocale, onAdd]);

  if (!open) return null;

  return (
    <div
      className="frosted-backdrop fixed inset-0 z-[70] flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={() => setOpen(false)}
      data-testid="global-quick-capture-backdrop"
    >
      <div
        ref={dialogRef}
        className="frosted-surface bg-card rounded-xl border border-border p-3 w-[90vw] max-w-md shadow-lg"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('quickAdd.globalCapture')}
        data-testid="global-quick-capture"
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Command className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={t('quickAdd.placeholder')}
            className="flex-1 border-0 shadow-none focus-visible:ring-0"
            data-testid="global-quick-capture-input"
          />
          <Button type="submit" size="sm" data-testid="global-quick-capture-submit">
            {t('quickAdd.add')}
          </Button>
        </form>
      </div>
    </div>
  );
}
