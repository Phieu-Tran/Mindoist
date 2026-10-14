import '@/styles/heroui.css';
import type { UiKitComponents } from '../kit';
import { Button } from './button';
import { Input } from './input';
import { Checkbox } from './checkbox';
import { Switch } from './switch';
import { Select } from './select';
import { DatePicker, DateRangePicker } from './date-picker';
import { PopoverPanel } from './popover-panel';
import { ModalFrame } from './modal-frame';
import { ActionMenu } from './action-menu';

/**
 * The HeroUI kit. Anything not listed falls back to the legacy component
 * (see registerUiKit), so this kit is always safe to switch on.
 */
export const herouiKit: Partial<UiKitComponents> = {
  Button,
  Input,
  Checkbox,
  Switch,
  Select,
  DatePicker,
  DateRangePicker,
  PopoverPanel,
  ModalFrame,
  ActionMenu,
};
