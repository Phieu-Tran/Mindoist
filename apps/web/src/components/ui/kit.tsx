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
export async function loadUiKit(kit: UiKit): Promise<UiKit> {
  if (kit === 'heroui') {
    try {
      const { herouiKit } = await import('./heroui');
      registerUiKit('heroui', herouiKit);
      return 'heroui';
    } catch (error) {
      console.error('[ui-kit] HeroUI kit failed to load; falling back to legacy', error);
    }
  }
  registerUiKit('legacy', {});
  return 'legacy';
}
