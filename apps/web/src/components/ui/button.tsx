import * as React from 'react';
import { getKit } from './kit';
import { buttonVariants, type ButtonProps } from './legacy/button';

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const Impl = getKit().Button;
  return <Impl ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants, type ButtonProps };
