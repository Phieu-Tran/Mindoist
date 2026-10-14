import * as React from 'react';
import { Checkbox as HeroCheckbox } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { CheckboxProps } from '../legacy/checkbox';

type HeroCheckboxProps = React.ComponentProps<typeof HeroCheckbox>;

/**
 * Task/checklist completion toggle. HeroUI's root is React Aria's
 * CheckboxField (layout only); the interactive part is `Checkbox.Content`
 * (CheckboxButton), so the caller's test id and click handler go there while
 * layout classes stay on the root.
 */
export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, children: _children, onClick, 'data-testid': testId, ...rest }: CheckboxProps & { 'data-testid'?: string }, _ref) => (
    <HeroCheckbox
      isSelected={Boolean(checked)}
      onChange={value => onCheckedChange?.(value)}
      isDisabled={disabled}
      className={cn('mindoist-checkbox', className)}
      {...(rest as Omit<HeroCheckboxProps, 'className' | 'children'>)}
    >
      <HeroCheckbox.Content data-testid={testId} onClick={onClick as never}>
        <HeroCheckbox.Control>
          <HeroCheckbox.Indicator />
        </HeroCheckbox.Control>
      </HeroCheckbox.Content>
    </HeroCheckbox>
  ),
);
Checkbox.displayName = 'HeroUICheckbox';
