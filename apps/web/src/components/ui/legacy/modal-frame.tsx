import type { ReactNode, RefObject } from 'react';
import { useDialogA11y } from '../dialog';

export interface ModalFrameProps {
  open: boolean;
  onClose: () => void;
  role?: 'dialog' | 'alertdialog';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'data-testid'?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Legacy: classes of the full-screen backdrop wrapper. */
  overlayClassName: string;
  /** Classes of the dialog panel itself (used by both kits). */
  className?: string;
  /** Legacy: which backdrop event dismisses (sites differ). */
  dismissOn?: 'click' | 'mousedown';
  /** False while a blocking action runs: Escape and backdrop do nothing. */
  dismissable?: boolean;
  /** Legacy: element type of the panel. */
  as?: 'div' | 'section';
  children: ReactNode;
}

/**
 * Legacy modal shell — the markup the dialogs rendered by hand: a backdrop
 * that dismisses on click, a panel that stops propagation, and the shared
 * focus-trap/Escape/restore-focus behaviour from useDialogA11y.
 */
export function ModalFrame({
  open,
  onClose,
  role = 'dialog',
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'data-testid': testId,
  initialFocusRef,
  overlayClassName,
  className,
  dismissOn = 'click',
  as: Panel = 'div',
  dismissable = true,
  children,
}: ModalFrameProps) {
  const dialogRef = useDialogA11y<HTMLElement>({ open, onClose, initialFocusRef, closeOnEscape: dismissable });
  if (!open) return null;
  const backdropHandler = { [dismissOn === 'click' ? 'onClick' : 'onMouseDown']: () => { if (dismissable) onClose(); } };
  const stop = { [dismissOn === 'click' ? 'onClick' : 'onMouseDown']: (event: React.SyntheticEvent) => event.stopPropagation() };
  return (
    <div className={overlayClassName} {...backdropHandler}>
      <Panel
        ref={dialogRef as RefObject<HTMLDivElement>}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={className}
        data-testid={testId}
        {...stop}
      >
        {children}
      </Panel>
    </div>
  );
}
