import '@/styles/heroui.css';
import type { UiKitComponents } from '../kit';
import { Button } from './button';
import { Input } from './input';
import { Checkbox } from './checkbox';
import { Switch } from './switch';
import { Select } from './select';

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
};
