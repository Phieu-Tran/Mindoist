import { getKitOverrides } from './kit';
import { Select as LegacySelect, type SelectOption, type SelectProps } from './legacy/select';

export function Select(props: SelectProps) {
  const Impl = getKitOverrides().Select ?? LegacySelect;
  return <Impl {...props} />;
}

export type { SelectOption, SelectProps };
