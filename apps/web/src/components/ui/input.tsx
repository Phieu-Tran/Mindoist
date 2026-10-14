import * as React from 'react';
import { getKit, type InputProps } from './kit';

const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const Impl = getKit().Input;
  return <Impl ref={ref} {...props} />;
});
Input.displayName = 'Input';

export { Input, type InputProps };
