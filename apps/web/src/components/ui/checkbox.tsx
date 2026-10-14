import * as React from 'react';
import { getKitOverrides } from './kit';
import { Checkbox as LegacyCheckbox, type CheckboxProps } from './legacy/checkbox';

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>((props, ref) => {
  const Impl = getKitOverrides().Checkbox ?? LegacyCheckbox;
  return <Impl ref={ref} {...props} />;
});
Checkbox.displayName = 'Checkbox';

export { Checkbox, type CheckboxProps };
