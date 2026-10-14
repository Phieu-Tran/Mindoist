import { getKitOverrides } from './kit';
import { PopoverPanel as LegacyPopoverPanel, type PopoverPanelProps } from './legacy/popover-panel';

export function PopoverPanel(props: PopoverPanelProps) {
  const Impl = getKitOverrides().PopoverPanel ?? LegacyPopoverPanel;
  return <Impl {...props} />;
}

export type { PopoverPanelProps };
