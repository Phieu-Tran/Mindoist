import { ListBox, Select as HeroSelect } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { SelectProps } from '../legacy/select';

// React Aria treats '' as "no selection", but callers use '' as a real
// option (e.g. "No project"). Round-trip it through a sentinel key.
const EMPTY_KEY = '__mindoist-empty__';
const toKey = (value: string) => (value === '' ? EMPTY_KEY : value);
const fromKey = (key: string) => (key === EMPTY_KEY ? '' : key);

/**
 * Same props as the legacy Select (value/options/onChange). The trigger keeps
 * the caller's `data-testid` and `aria-label`; options get `role="option"`
 * from React Aria's ListBox, with full keyboard and typeahead support.
 */
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
  const repick = (option: HTMLElement | null) => {
    const key = option?.dataset.optionKey;
    if (key != null && fromKey(key) === value) onChange(value);
  };

  return (
    <HeroSelect
      aria-label={ariaLabel}
      placeholder={placeholder ?? 'Select...'}
      value={options.some(option => option.value === value) ? toKey(value) : null}
      onChange={key => { if (key != null) onChange(fromKey(String(key))); }}
      isDisabled={disabled}
      className={cn('mindoist-select', size === 'sm' && 'mindoist-select--sm', className)}
    >
      <HeroSelect.Trigger data-testid={testId} className={triggerClassName}>
        <HeroSelect.Value />
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover placement={align === 'right' ? 'bottom end' : 'bottom start'} className="min-w-[8rem]">
        {/* React Aria doesn't report re-picking the selected option; the
            legacy Select did, and callers rely on it (CalendarView persists
            the view on any explicit pick). Changes still arrive through
            onChange above, so only the unchanged pick is reported here —
            in the capture phase, before the popover closes and unmounts. */}
        <div
          className="contents"
          onPointerUpCapture={event => repick((event.target as HTMLElement).closest<HTMLElement>('[data-option-key]'))}
          onKeyDownCapture={event => {
            if (event.key === 'Enter' || event.key === ' ') repick((event.target as HTMLElement).closest<HTMLElement>('[data-option-key]'));
          }}
        >
          <ListBox aria-label={ariaLabel}>
            {options.map(option => (
              <ListBox.Item key={option.value} id={toKey(option.value)} textValue={option.label} data-option-key={toKey(option.value)}>
                {option.dotColor && (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: option.dotColor }} aria-hidden="true" />
                )}
                <span className="flex-1 truncate">{option.label}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </div>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}
