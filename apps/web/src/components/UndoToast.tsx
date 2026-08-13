import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, X } from 'lucide-react';
import { Button } from './ui/button';

export interface UndoToastState {
  id: string;
  message: string;
  actionLabel?: string;
  onUndo?: () => Promise<void> | void;
}

interface Props {
  toast: UndoToastState | null;
  onUndo: () => void;
  onDismiss: () => void;
  dismissLabel: string;
}

export function UndoToast({ toast, onUndo, onDismiss, dismissLabel }: Props) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          data-testid="undo-toast"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.16 }}
          className="fixed bottom-4 left-1/2 z-[70] flex w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2.5 text-sm text-popover-foreground shadow-lg shadow-black/10 dark:shadow-black/30 sm:bottom-5"
        >
          <span className="min-w-0 flex-1 truncate">{toast.message}</span>
          {toast.onUndo && toast.actionLabel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="undo-toast-action"
              onClick={onUndo}
              className="h-8 shrink-0 gap-1.5 px-2 text-primary hover:text-primary"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {toast.actionLabel}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="undo-toast-dismiss"
            onClick={onDismiss}
            className="h-7 w-7 shrink-0 text-muted-foreground"
            aria-label={dismissLabel}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
