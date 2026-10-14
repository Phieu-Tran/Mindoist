import type { ComponentType, ForwardRefExoticComponent, RefAttributes } from 'react';
import type { ButtonProps } from './legacy/button';
import type { CheckboxProps } from './legacy/checkbox';
import type { SwitchProps } from './legacy/switch';
import type { SelectProps } from './legacy/select';
import type { DatePickerProps, DateRangePickerProps, TimePickerProps } from './legacy/date-picker';
import type { PopoverPanelProps } from './legacy/popover-panel';
import type { ModalFrameProps } from './legacy/modal-frame';
import type { ActionMenuProps } from './legacy/action-menu';
import { applyUiKitAttribute, type UiKit } from '@/lib/ui-kit';
import { reloadForStaleChunk } from '@/lib/chunk-reload';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * The swappable primitives. Facades in components/ui/*.tsx render the active
 * kit's override when there is one, else their legacy implementation, so call
 * sites never branch on the kit.
 */
export interface UiKitComponents {
  Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement>>;
  Input: ForwardRefExoticComponent<InputProps & RefAttributes<HTMLInputElement>>;
  Checkbox: ForwardRefExoticComponent<CheckboxProps & RefAttributes<HTMLButtonElement>>;
  Switch: ForwardRefExoticComponent<SwitchProps & RefAttributes<HTMLButtonElement>>;
  Select: ComponentType<SelectProps>;
  DatePicker: ComponentType<DatePickerProps>;
  DateRangePicker: ComponentType<DateRangePickerProps>;
  TimePicker: ComponentType<TimePickerProps>;
  PopoverPanel: ComponentType<PopoverPanelProps>;
  ModalFrame: ComponentType<ModalFrameProps>;
  ActionMenu: ComponentType<ActionMenuProps>;
  Skeleton: ComponentType<React.HTMLAttributes<HTMLDivElement>>;
}

// Only the active kit's *overrides* live here. Each facade imports its own
// legacy implementation, so legacy code stays in the chunks that use it
// (importing every legacy primitive here pulled lazy-only ones, like the
// framer-motion Select, into the entry bundle).
let overrides: Partial<UiKitComponents> = {};
let activeKitName: UiKit = 'legacy';

export function getKitOverrides(): Partial<UiKitComponents> {
  return overrides;
}

export function getActiveUiKit(): UiKit {
  return activeKitName;
}

/** Test/bootstrap hook: install a kit synchronously. */
export function registerUiKit(name: UiKit, components: Partial<UiKitComponents>) {
  overrides = components;
  activeKitName = name;
  if (typeof document !== 'undefined') applyUiKitAttribute(name);
}

/**
 * Loads the requested kit before the first render. The HeroUI kit (and its
 * stylesheet) is a separate chunk, so `legacy` users never download it. If
 * the chunk fails to load, the app falls back to legacy rather than blank.
 */
/** heroui.css defines this on :root; nothing else does. */
function herouiStylesheetApplied() {
  return getComputedStyle(document.documentElement).getPropertyValue('--field-radius').trim() !== '';
}

export async function loadUiKit(kit: UiKit): Promise<UiKit> {
  if (kit === 'heroui') {
    try {
      // Right after a deploy a cold CDN edge (or a stale tab) can answer the
      // kit's chunk with index.html. A failed JS chunk resolves to undefined
      // once the stale-chunk handler has taken over; a failed stylesheet is
      // silently ignored by the browser and would leave HeroUI unstyled.
      const kitModule = await import('./heroui') as { herouiKit?: Partial<UiKitComponents> } | undefined;
      if (!kitModule?.herouiKit) throw new Error('HeroUI kit chunk did not load');
      if (!herouiStylesheetApplied()) throw new Error('HeroUI kit stylesheet did not load');
      registerUiKit('heroui', kitModule.herouiKit);
      return 'heroui';
    } catch (error) {
      // Retry once with a fresh page load (shared 30 s loop guard with the
      // stale-chunk handler). Never resolve meanwhile, so nothing renders.
      if (reloadForStaleChunk()) return new Promise<UiKit>(() => {});
      console.warn('[ui-kit] HeroUI kit failed to load; falling back to legacy', error);
    }
  }
  registerUiKit('legacy', {});
  return 'legacy';
}
