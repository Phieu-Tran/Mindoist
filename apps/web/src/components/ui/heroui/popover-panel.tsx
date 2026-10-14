import { Popover as HeroPopover } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { PopoverPanelProps } from '../legacy/popover-panel';

/**
 * HeroUI anchored panel: portalled React Aria Popover, so it is never
 * clipped by TaskDetail's overflow, flips when there's no room below, and
 * gets React Aria's focus containment and Escape handling.
 */
export function PopoverPanel({
  open,
  onClose,
  anchorRef,
  containerRef,
  panelRef,
  role,
  'aria-label': ariaLabel,
  placement = 'bottom start',
  heroClassName,
  'data-testid': testId,
  children,
}: PopoverPanelProps) {
  return (
    <HeroPopover.Content
      triggerRef={anchorRef}
      isOpen={open}
      onOpenChange={next => { if (!next) onClose(); }}
      shouldCloseOnInteractOutside={element => !containerRef?.current?.contains(element)}
      placement={placement}
      className={cn('mindoist-popover-panel', heroClassName)}
    >
      {role === 'dialog' ? (
        <HeroPopover.Dialog ref={panelRef} aria-label={ariaLabel} data-testid={testId} className="outline-none">
          {children}
        </HeroPopover.Dialog>
      ) : (
        <div ref={panelRef} role="listbox" aria-label={ariaLabel} data-testid={testId}>
          {children}
        </div>
      )}
    </HeroPopover.Content>
  );
}
