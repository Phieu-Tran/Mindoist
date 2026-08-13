import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  it('uses x to select and e to complete', () => {
    const onToggleSelection = vi.fn();
    const onToggleComplete = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onToggleSelection, onToggleComplete }));

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })));

    expect(onToggleSelection).toHaveBeenCalledOnce();
    expect(onToggleComplete).toHaveBeenCalledOnce();
  });

  it('uses Enter to open the focused task', () => {
    const onOpen = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onOpen }));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('forwards navigation and shift expansion callbacks', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onExpandSelection = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onNext, onPrev, onExpandSelection }));

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' })));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'J', shiftKey: true })));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', shiftKey: true })));

    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onExpandSelection).toHaveBeenNthCalledWith(1, 'next');
    expect(onExpandSelection).toHaveBeenNthCalledWith(2, 'previous');
  });

  it('does not treat modified app chords as single-key task navigation', () => {
    const onPrev = vi.fn();
    const onQuickAdd = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onPrev, onQuickAdd }));

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', metaKey: true })));

    expect(onPrev).not.toHaveBeenCalled();
    expect(onQuickAdd).not.toHaveBeenCalled();
  });
});
