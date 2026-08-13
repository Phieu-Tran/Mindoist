import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useDialogA11y } from './ui/dialog';
import { Button } from './ui/button';

const SHORTCUTS = [
  ['J / K', 'Move down / up'],
  ['Shift+J / K', 'Extend selection'],
  ['X', 'Select or unselect'],
  ['Enter', 'Open task details'],
  ['E', 'Complete task'],
  ['S', 'Schedule task'],
  ['T / W', 'Move to today / tomorrow'],
  ['1–4', 'Set priority'],
  ['#', 'Assign a tag'],
  ['Cmd/Ctrl+Z', 'Undo'],
  ['G then T/C/P/R', 'Go to a primary view'],
  ['Cmd/Ctrl+K', 'Open command bar'],
] as const;

export function ShortcutHelpDialog() {
  const [open, setOpen] = useState(false);
  const dialogRef = useDialogA11y({ open, onClose: () => setOpen(false) });

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('mindoist:shortcut-help', show);
    return () => window.removeEventListener('mindoist:shortcut-help', show);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-panel border border-border bg-card shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
        data-testid="shortcut-help-dialog"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="shortcut-help-title" className="m-0 text-lg font-semibold">Keyboard shortcuts</h2>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close shortcuts"><X aria-hidden="true" /></Button>
        </header>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-3 p-4 text-sm">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className="contents">
              <dt><kbd className="rounded-chip border border-border bg-muted px-2 py-1 font-mono text-xs">{keys}</kbd></dt>
              <dd className="m-0 text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
