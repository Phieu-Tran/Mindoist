import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  resizeEdge?: 'left' | 'right';
  className?: string;
  testId?: string;
  label: string;
}

function initialWidth(storageKey: string, fallback: number, min: number, max: number) {
  const stored = Number(localStorage.getItem(storageKey));
  return Number.isFinite(stored) && stored >= min && stored <= max ? stored : fallback;
}

export function PersistentResizablePanel({ children, storageKey, defaultWidth, minWidth = 240, maxWidth = 560, resizeEdge = 'right', className, testId, label }: Props) {
  const [width, setWidth] = useState(() => initialWidth(storageKey, defaultWidth, minWidth, maxWidth));
  const commit = (next: number) => {
    const value = Math.min(maxWidth, Math.max(minWidth, Math.round(next)));
    setWidth(value);
    localStorage.setItem(storageKey, String(value));
  };
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = width;
    const direction = resizeEdge === 'right' ? 1 : -1;
    const move = (moveEvent: PointerEvent) => commit(originWidth + (moveEvent.clientX - originX) * direction);
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  return (
    <aside data-testid={testId} className={cn('group/resizable relative', className)} style={{ width }} aria-label={label}>
      {children}
      <div
        role="separator"
        tabIndex={0}
        aria-label={`Resize ${label}`}
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        onPointerDown={startResize}
        onKeyDown={event => {
          const direction = resizeEdge === 'right' ? 1 : -1;
          if (event.key === 'ArrowLeft') { event.preventDefault(); commit(width - 16 * direction); }
          if (event.key === 'ArrowRight') { event.preventDefault(); commit(width + 16 * direction); }
        }}
        className={cn('absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-transparent hover:after:bg-primary focus-visible:after:bg-ring', resizeEdge === 'right' ? '-right-1' : '-left-1')}
      />
    </aside>
  );
}
