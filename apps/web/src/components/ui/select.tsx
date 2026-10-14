import { getKit } from './kit';
import type { SelectOption, SelectProps } from './legacy/select';

export function Select(props: SelectProps) {
  const Impl = getKit().Select;
  return <Impl {...props} />;
}

export type { SelectOption, SelectProps };
