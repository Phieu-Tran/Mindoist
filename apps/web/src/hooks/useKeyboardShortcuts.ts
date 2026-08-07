import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
  onQuickAdd?: () => void;
  onEscape?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSelect?: () => void;
  onDelete?: () => void;
  onToggleComplete?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Global shortcuts (work even in inputs)
    if (e.key === 'Escape') {
      handlers.onEscape?.();
      return;
    }

    // Don't fire shortcuts when typing in inputs
    if (isInput) return;

    if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      handlers.onQuickAdd?.();
    } else if (e.key === 'j') {
      e.preventDefault();
      handlers.onNext?.();
    } else if (e.key === 'k') {
      e.preventDefault();
      handlers.onPrev?.();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handlers.onSelect?.();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      handlers.onDelete?.();
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      handlers.onToggleComplete?.();
    }
  }, [handlers]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
