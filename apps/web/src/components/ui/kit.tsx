import type { ComponentType, ForwardRefExoticComponent, RefAttributes } from 'react';
import { Button as LegacyButton, type ButtonProps } from './legacy/button';
import { Input as LegacyInput } from './legacy/input';
import { Checkbox as LegacyCheckbox, type CheckboxProps } from './legacy/checkbox';
import { Switch as LegacySwitch, type SwitchProps } from './legacy/switch';
import { Select as LegacySelect, type SelectProps } from './legacy/select';
import {
  DatePicker as LegacyDatePicker,
  DateRangePicker as LegacyDateRangePicker,
  TimePicker as LegacyTimePicker,
  type DatePickerProps,
  type DateRangePickerProps,
  type TimePickerProps,
} from './legacy/date-picker';
import { applyUiKitAttribute, type UiKit } from '@/lib/ui-kit';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * The swappable primitives. Facades in components/ui/*.tsx render whichever
 * implementation is registered here, so call sites never branch on the kit.
 * A kit may leave entries out; those keep the legacy implementation.
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
}

export const legacyKit: UiKitComponents = {
  Button: LegacyButton,
  Input: LegacyInput,
  Checkbox: LegacyCheckbox,
  Switch: LegacySwitch,
  Select: LegacySelect,
  DatePicker: LegacyDatePicker,
  DateRangePicker: LegacyDateRangePicker,
  TimePicker: LegacyTimePicker,
};

let activeKit: UiKitComponents = legacyKit;
let activeKitName: UiKit = 'legacy';

export function getKit(): UiKitComponents {
  return activeKit;
}

export function getActiveUiKit(): UiKit {
  return activeKitName;
}

/** Test/bootstrap hook: install a kit synchronously. */
export function registerUiKit(name: UiKit, components: Partial<UiKitComponents>) {
  activeKit = { ...legacyKit, ...components };
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
