import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ACCENT_CHANGE_EVENT,
  ACCENT_OPTIONS,
  applyAccent,
  getStoredAccent,
  type Accent,
} from '@/lib/appearance';

interface Props {
  side?: 'top' | 'bottom';
  variant?: 'icon' | 'row';
}

export function AccentPicker({ side = 'bottom', variant = 'icon' }: Props) {
  const { t } = useTranslation('common');
  const [accent, setAccent] = useState<Accent>(getStoredAccent);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentLabel = t(`appearance.colors.${accent}`);

  useEffect(() => applyAccent(accent), [accent]);

  // AccentPicker renders in both the sidebar and Settings at the same time —
  // pick up changes made through the *other* instance instead of going stale.
  useEffect(() => {
    const handleChange = (event: Event) => {
      const next = (event as CustomEvent<Accent>).detail;
      setAccent(current => (current === next ? current : next));
    };
    window.addEventListener(ACCENT_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(ACCENT_CHANGE_EVENT, handleChange);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectAccent = (nextAccent: Accent) => {
    setAccent(nextAccent);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn('relative', variant === 'row' && 'w-full')}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size={variant === 'row' ? 'sm' : 'icon'}
        onClick={() => setOpen(value => !value)}
        aria-label={t('appearance.currentAccent', { accent: currentLabel })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="accent-picker-panel"
        data-testid="accent-picker-trigger"
        title={t('appearance.accent')}
        className={cn(variant === 'row' && 'w-full justify-start gap-2 px-3')}
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
        {variant === 'row' && <span className="flex-1 text-left">{t('appearance.accent')}</span>}
        {variant === 'row' && <span className="text-xs text-muted-foreground">{currentLabel}</span>}
        <span
          className={cn(
            'h-2 w-2 rounded-full border border-background bg-primary',
            variant === 'icon' && 'absolute bottom-1.5 right-1.5',
          )}
          aria-hidden="true"
        />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="accent-picker-panel"
            role="dialog"
            aria-label={t('appearance.chooseAccent')}
            className={cn(
              'absolute z-[70] rounded-xl border border-border bg-card p-3 shadow-lg',
              side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
              variant === 'row' ? 'left-0 w-full' : 'right-0 w-56',
            )}
            data-testid="accent-picker-panel"
            initial={{ opacity: 0, y: side === 'top' ? 6 : -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === 'top' ? 6 : -6, scale: 0.96 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
          >
            <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
              {t('appearance.accent')}
            </p>
            <div role="radiogroup" aria-label={t('appearance.chooseAccent')} className="grid gap-1">
              {ACCENT_OPTIONS.map(option => {
                const selected = option.value === accent;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => selectAccent(option.value)}
                    className={cn(
                      'flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm',
                      'transition-[transform,opacity,background-color] duration-150 hover:bg-muted active:scale-[0.98]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected && 'bg-muted font-medium',
                    )}
                  >
                    <span
                      className={cn('accent-swatch h-5 w-5 shrink-0 rounded-full', `accent-swatch-${option.value}`)}
                      aria-hidden="true"
                    />
                    <span className="flex-1">{t(option.labelKey)}</span>
                    {selected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
