import * as React from 'react';
import { getKitOverrides } from './kit';
import { Button as LegacyButton, buttonVariants, type ButtonProps } from './legacy/button';

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const Impl = getKitOverrides().Button ?? LegacyButton;
  return <Impl ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants, type ButtonProps };
