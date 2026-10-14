import { Menu as HeroMenu, Popover as HeroPopover } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { ActionMenuProps } from '../legacy/action-menu';

/**
 * HeroUI menu: portalled React Aria Popover + Menu — roving focus with arrow
 * keys, Home/End, typeahead, and Escape/outside-press dismissal.
 */
export function ActionMenu({
  open,
  onClose,
  onAction,
  items,
  'aria-label': ariaLabel,
  heading,
  anchorRef,
  containerRef,
  panelRef,
  placement = 'bottom end',
  heroClassName,
}: ActionMenuProps) {
  return (
    <HeroPopover.Content
      triggerRef={anchorRef}
      isOpen={open}
      onOpenChange={next => { if (!next) onClose(); }}
      shouldCloseOnInteractOutside={element => !containerRef?.current?.contains(element)}
      placement={placement}
      className={cn('mindoist-popover-panel', heroClassName)}
    >
      <div ref={panelRef} className="p-1">
        {heading != null && (
          <div className="px-2 pb-1 pt-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden="true">
            {heading}
          </div>
        )}
        <HeroMenu
          aria-label={ariaLabel}
          autoFocus="first"
          disabledKeys={items.filter(item => item.disabled).map(item => item.key)}
          // Standard menu behaviour: picking an item closes the menu before
          // the action runs (e.g. a confirm dialog opens over a closed menu).
          onAction={key => { onClose(); onAction(String(key)); }}
        >
          {items.map(item => (
            <HeroMenu.Item
              key={item.key}
              id={item.key}
              textValue={item.textValue}
              aria-label={item['aria-label']}
              data-testid={item['data-testid']}
              variant={item.danger ? 'danger' : undefined}
              className="mindoist-menu-item"
            >
              {item.content}
            </HeroMenu.Item>
          ))}
        </HeroMenu>
      </div>
    </HeroPopover.Content>
  );
}
