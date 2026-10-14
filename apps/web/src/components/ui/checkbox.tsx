import * as React from 'react';
import { getKit } from './kit';
import type { CheckboxProps } from './legacy/checkbox';

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>((props, ref) => {
  const Impl = getKit().Checkbox;
  return <Impl ref={ref} {...props} />;
});
Checkbox.displayName = 'Checkbox';

export { Checkbox, type CheckboxProps };
