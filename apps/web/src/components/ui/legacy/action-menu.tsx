import type { ReactNode, Ref, RefObject } from 'react';

export interface ActionMenuItem {
  key: string;
  /** Rendered inside the item as-is (icon + label) in both kits. */
  content: ReactNode;
  /** Plain text for typeahead and the accessible name. */
  textValue: string;
  'aria-label'?: string;
  disabled?: boolean;
  /** Legacy: classes of the item button. */
  className?: string;
  /** HeroUI: destructive styling. */
  danger?: boolean;
  'data-testid'?: string;
}

export interface ActionMenuProps {
  open: boolean;
  onClose: () => void;
  onAction: (key: string) => void;
  items: ActionMenuItem[];
  'aria-label': string;
  /** Non-interactive caption above the items (e.g. "Move to"). */
  heading?: ReactNode;
  /** Element the menu is anchored to (the trigger). */
  anchorRef: RefObject<HTMLElement | null>;
  /** Pointer events inside this element (the trigger wrapper) never dismiss. */
  containerRef?: RefObject<HTMLElement | null>;
  /** Attached to the menu panel in both kits, so callers' outside-click
   *  handlers can ignore clicks inside the (HeroUI: portalled) panel. */
  panelRef?: Ref<HTMLDivElement>;
  placement?: 'bottom start' | 'bottom end';
  /** Legacy: classes of the menu container. */
  className?: string;
  /** HeroUI: width/padding of the portalled panel. */
  heroClassName?: string;
}

/** Legacy menu: exactly the inline `role="menu"` markup the call sites had. */
export function ActionMenu({ open, onAction, items, heading, panelRef, className }: ActionMenuProps) {
  if (!open) return null;
  return (
    <div ref={panelRef} role="menu" className={className}>
      {heading != null && <span>{heading}</span>}
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          aria-label={item['aria-label']}
          data-testid={item['data-testid']}
          onClick={() => onAction(item.key)}
          className={item.className}
        >
          {item.content}
        </button>
      ))}
    </div>
  );
}
