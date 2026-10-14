import * as React from 'react';
import { getKitOverrides, type InputProps } from './kit';
import { Input as LegacyInput } from './legacy/input';

const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const Impl = getKitOverrides().Input ?? LegacyInput;
  return <Impl ref={ref} {...props} />;
});
Input.displayName = 'Input';

export { Input, type InputProps };
