import { getKitOverrides } from './kit';
import { ActionMenu as LegacyActionMenu, type ActionMenuItem, type ActionMenuProps } from './legacy/action-menu';

export function ActionMenu(props: ActionMenuProps) {
  const Impl = getKitOverrides().ActionMenu ?? LegacyActionMenu;
  return <Impl {...props} />;
}

export type { ActionMenuItem, ActionMenuProps };
