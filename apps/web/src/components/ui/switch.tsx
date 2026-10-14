import * as React from 'react';
import { getKitOverrides } from './kit';
import { Switch as LegacySwitch, type SwitchProps } from './legacy/switch';

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>((props, ref) => {
  const Impl = getKitOverrides().Switch ?? LegacySwitch;
  return <Impl ref={ref} {...props} />;
});
Switch.displayName = 'Switch';

export { Switch, type SwitchProps };
