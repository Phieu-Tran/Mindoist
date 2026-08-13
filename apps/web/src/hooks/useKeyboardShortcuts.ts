import { useEffect, useCallback, useRef } from 'react';

export interface ShortcutHandlers {
  onQuickAdd?: () => void;
  onEscape?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onOpen?: () => void;
  onToggleSelection?: () => void;
  onDelete?: () => void;
  onToggleComplete?: () => void;
  onSchedule?: () => void;
  onMoveToday?: () => void;
  onMoveTomorrow?: () => void;
  onSetPriority?: (priority: 1 | 2 | 3 | 4) => void;
  onUndo?: () => void;
  onHelp?: () => void;
  onExpandSelection?: (direction: 'next' | 'previous') => void;
  onGoTo?: (view: 'today' | 'calendar' | 'projects' | 'review') => void;
  onTags?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const goPrefix = useRef(false);
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Global shortcuts (work even in inputs)
    if (e.key === 'Escape') {
      handlers.onEscape?.();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      handlers.onUndo?.();
      return;
    }

    // Modified key chords belong to browser/app-level commands (for example
    // Ctrl+K opens Global Quick Capture). They must not also fall through to
    // the single-key task navigation shortcuts below.
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // Don't fire shortcuts when typing in inputs
    if (isInput) return;

    if (goPrefix.current) {
      goPrefix.current = false;
      const destinations = { t: 'today', c: 'calendar', p: 'projects', r: 'review' } as const;
      const destination = destinations[e.key.toLowerCase() as keyof typeof destinations];
      if (destination) {
        e.preventDefault();
        handlers.onGoTo?.(destination);
        return;
      }
    }

    if (e.key.toLowerCase() === 'g') {
      e.preventDefault();
      goPrefix.current = true;
      window.setTimeout(() => { goPrefix.current = false; }, 1_200);
      return;
    }

    if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      handlers.onQuickAdd?.();
    } else if (e.key.toLowerCase() === 'j' && e.shiftKey) {
      e.preventDefault();
      handlers.onExpandSelection?.('next');
    } else if (e.key.toLowerCase() === 'k' && e.shiftKey) {
      e.preventDefault();
      handlers.onExpandSelection?.('previous');
    } else if (e.key === 'j') {
      e.preventDefault();
      handlers.onNext?.();
    } else if (e.key === 'k') {
      e.preventDefault();
      handlers.onPrev?.();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handlers.onOpen?.();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      handlers.onDelete?.();
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      handlers.onToggleSelection?.();
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      handlers.onToggleComplete?.();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      handlers.onSchedule?.();
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      handlers.onMoveToday?.();
    } else if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      handlers.onMoveTomorrow?.();
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      handlers.onSetPriority?.(Number(e.key) as 1 | 2 | 3 | 4);
    } else if (e.key === '?') {
      e.preventDefault();
      handlers.onHelp?.();
    } else if (e.key === '#') {
      e.preventDefault();
      handlers.onTags?.();
    }
  }, [handlers]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
