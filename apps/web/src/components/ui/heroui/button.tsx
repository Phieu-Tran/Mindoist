import * as React from 'react';
import { Button as HeroButton } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { ButtonProps } from '../legacy/button';

type HeroButtonProps = React.ComponentProps<typeof HeroButton>;

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, HeroButtonProps['variant']> = {
  default: 'primary',
  destructive: 'danger',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'ghost',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, HeroButtonProps['size']> = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
};

/**
 * HeroUI Button behind the legacy Button API. React Aria still honours a
 * native `onClick` (usePress forwards it), so call sites keep their handlers.
 * `type` defaults to the HTML default (`submit`) like the legacy <button>,
 * not React Aria's `button`, so forms keep submitting the same way.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, disabled, type = 'submit', children, ...rest }, ref) => (
    <HeroButton
      ref={ref}
      type={type}
      variant={VARIANTS[variant ?? 'default']}
      size={SIZES[size ?? 'default']}
      isIconOnly={size === 'icon'}
      isDisabled={disabled}
      className={cn(variant === 'link' && 'mindoist-button-link', className ?? undefined)}
      {...(rest as Omit<HeroButtonProps, 'className' | 'children'>)}
    >
      {children}
    </HeroButton>
  ),
);
Button.displayName = 'HeroUIButton';
