import * as React from 'react';
import { Switch as HeroSwitch } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { SwitchProps } from '../legacy/switch';

type HeroSwitchProps = React.ComponentProps<typeof HeroSwitch>;

/** Same split as Checkbox: root = field layout, `Switch.Content` = the button. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, children: _children, onClick, 'data-testid': testId, ...rest }: SwitchProps & { 'data-testid'?: string }, _ref) => (
    <HeroSwitch
      size="sm"
      isSelected={checked}
      onChange={value => onCheckedChange?.(value)}
      isDisabled={disabled}
      className={cn('mindoist-switch', className)}
      {...(rest as Omit<HeroSwitchProps, 'className' | 'children'>)}
    >
      <HeroSwitch.Content data-testid={testId} onClick={onClick as never}>
        <HeroSwitch.Control>
          <HeroSwitch.Thumb />
        </HeroSwitch.Control>
      </HeroSwitch.Content>
    </HeroSwitch>
  ),
);
Switch.displayName = 'HeroUISwitch';
