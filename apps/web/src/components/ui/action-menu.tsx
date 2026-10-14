import { getKit } from './kit';
import type { ActionMenuItem, ActionMenuProps } from './legacy/action-menu';

export function ActionMenu(props: ActionMenuProps) {
  const Impl = getKit().ActionMenu;
  return <Impl {...props} />;
}

export type { ActionMenuItem, ActionMenuProps };
