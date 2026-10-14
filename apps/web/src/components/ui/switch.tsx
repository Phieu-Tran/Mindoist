import * as React from 'react';
import { getKit } from './kit';
import type { SwitchProps } from './legacy/switch';

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>((props, ref) => {
  const Impl = getKit().Switch;
  return <Impl ref={ref} {...props} />;
});
Switch.displayName = 'Switch';

export { Switch, type SwitchProps };
