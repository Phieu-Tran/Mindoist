import * as React from 'react';
import { Input as HeroInput } from '@heroui/react';
import type { InputProps } from '../kit';

type HeroInputProps = React.ComponentProps<typeof HeroInput>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ type = 'text', className, ...props }, ref) => (
    <HeroInput
      ref={ref}
      type={type}
      fullWidth
      className={className}
      {...(props as Omit<HeroInputProps, 'className'>)}
    />
  ),
);
Input.displayName = 'HeroUIInput';
