import { Modal as HeroModal } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { ModalFrameProps } from '../legacy/modal-frame';

/**
 * HeroUI modal shell: React Aria ModalOverlay/Modal/Dialog — focus
 * containment, inert background, scroll lock, Escape and outside-press
 * dismissal. The panel keeps the caller's classes, so content looks the same.
 */
export function ModalFrame({
  open,
  onClose,
  role = 'dialog',
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'data-testid': testId,
  className,
  dismissable = true,
  children,
}: ModalFrameProps) {
  return (
    <HeroModal.Backdrop
      isOpen={open}
      onOpenChange={next => { if (!next) onClose(); }}
      isDismissable={dismissable}
      isKeyboardDismissDisabled={!dismissable}
      className="mindoist-modal-backdrop"
    >
      <HeroModal.Container placement="center" className="mindoist-modal-container">
        <HeroModal.Dialog
          role={role}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          data-testid={testId}
          className={cn('mindoist-modal', className)}
        >
          {children}
        </HeroModal.Dialog>
      </HeroModal.Container>
    </HeroModal.Backdrop>
  );
}
