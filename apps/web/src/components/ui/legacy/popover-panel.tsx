import type { CSSProperties, ReactNode, Ref, RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface PopoverPanelProps {
  open: boolean;
  onClose: () => void;
  /** Element the panel is anchored to (usually the trigger button). */
  anchorRef: RefObject<HTMLElement | null>;
  /** Pointer events inside this element (the trigger wrapper) never dismiss. */
  containerRef?: RefObject<HTMLElement | null>;
  /** Attached to the panel element in both kits — pass it to
   *  useDismissiblePopover as the portal ref so clicks inside don't dismiss. */
  panelRef?: Ref<HTMLDivElement>;
  role: 'dialog' | 'listbox';
  'aria-label': string;
  placement?: 'bottom start' | 'bottom end';
  /** Legacy: classes that position and style the in-flow panel. */
  className?: string;
  style?: CSSProperties;
  /** HeroUI: width/padding of the portalled panel (positioning is automatic). */
  heroClassName?: string;
  'data-testid'?: string;
  /** Legacy: render into document.body (for panels positioned with `fixed`). */
  portal?: boolean;
  children: ReactNode;
}

/** Legacy anchored panel: exactly the markup the fields rendered inline. */
export function PopoverPanel({ open, panelRef, role, 'aria-label': ariaLabel, className, style, 'data-testid': testId, portal, children }: PopoverPanelProps) {
  if (!open) return null;
  const panel = (
    <div ref={panelRef} role={role} aria-label={ariaLabel} className={className} style={style} data-testid={testId}>
      {children}
    </div>
  );
  return portal ? createPortal(panel, document.body) : panel;
}
