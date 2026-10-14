import { getKit } from './kit';
import type { PopoverPanelProps } from './legacy/popover-panel';

export function PopoverPanel(props: PopoverPanelProps) {
  const Impl = getKit().PopoverPanel;
  return <Impl {...props} />;
}

export type { PopoverPanelProps };
