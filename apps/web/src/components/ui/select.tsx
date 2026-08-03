import { useRef, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  dotColor?: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
  size?: 'sm' | 'default';
  align?: 'left' | 'right';
}

export function Select({
  value,
  options,
  onChange,
  placeholder,
  className,
  triggerClassName,
  disabled,
  'aria-label': ariaLabel,
  'data-testid': testId,
  size = 'default',
  align = 'left',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find(o => o.value === value);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = options.findIndex(o => o.value === value);
        const next = e.key === 'ArrowDown'
          ? (idx + 1) % options.length
          : (idx - 1 + options.length) % options.length;
        onChange(options[next].value);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    // Capture phase so this beats the panel's own Escape-closes-panel listener.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, close, options, value, onChange]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'inline-flex items-center justify-between gap-1.5 rounded-control border border-input bg-background text-left cursor-pointer transition-colors hover:border-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          size === 'sm'
            ? 'h-7 min-w-0 px-2 text-[0.68rem]'
            : 'h-8 min-w-0 px-2.5 text-xs',
          disabled && 'opacity-50 cursor-not-allowed',
          triggerClassName,
        )}
      >
        <span className={cn(
          'flex min-w-0 items-center gap-1.5 truncate',
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {selected?.dotColor && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: selected.dotColor }} aria-hidden="true" />
          )}
          <span className="truncate">{selected?.label ?? placeholder ?? 'Select...'}</span>
        </span>
        <ChevronDown className={cn(
          'shrink-0 text-muted-foreground transition-transform duration-150',
          size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5',
          open && 'rotate-180',
        )} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={ariaLabel}
            className={cn(
              'frosted-surface absolute z-[80] mt-1 min-w-[8rem] max-w-[calc(100vw-2rem)] max-h-[14rem] overflow-y-auto',
              'rounded-panel border border-border bg-card',
              'shadow-lg shadow-black/10 dark:shadow-black/30',
              align === 'right' ? 'right-0' : 'left-0'
            )}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
          >
            {options.map(option => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(option.value); close(); }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-xs text-left cursor-pointer',
                    'transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected && 'bg-accent font-medium',
                  )}
                >
                  {option.dotColor && (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: option.dotColor }} aria-hidden="true" />
                  )}
                  <span className="flex-1 truncate">{option.label}</span>
                  {isSelected && <Check className="h-3 w-3 shrink-0 text-primary" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
