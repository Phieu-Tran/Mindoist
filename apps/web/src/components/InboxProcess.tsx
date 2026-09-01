import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Clock3, Trash2, X } from 'lucide-react';
import type { Task, UpdateTaskRequest } from '@mindoist/shared/types';
import { Button } from './ui/button';

interface InboxProcessProps {
  tasks: Task[];
  onComplete: (task: Task) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
  onUpdate: (id: string, request: UpdateTaskRequest) => Promise<void>;
  onSchedule: (task: Task) => void;
  onClose: () => void;
}

/** Keyboard-first inbox zero loop: plan, snooze, complete, or delete. */
export function InboxProcess({ tasks, onComplete, onDelete, onUpdate, onSchedule, onClose }: InboxProcessProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const queue = useMemo(() => tasks.filter(task => {
    if (task.completedAt) return false;
    if (!task.snoozedUntil) return true;
    const snoozeAt = new Date(task.snoozedUntil).getTime();
    return Number.isNaN(snoozeAt) || snoozeAt <= now;
  }), [now, tasks]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = queue[index];

  useEffect(() => {
    if (index >= queue.length && queue.length > 0) setIndex(queue.length - 1);
  }, [index, queue.length]);

  const advance = () => setIndex(value => Math.min(value + 1, Math.max(queue.length - 1, 0)));
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      advance();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!current || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') onClose();
      if (event.key.toLowerCase() === 'p') onSchedule(current);
      if (event.key.toLowerCase() === 'd') void run(() => onComplete(current));
      if (event.key.toLowerCase() === 'x') void run(() => onDelete(current));
      if (event.key.toLowerCase() === 's') void run(() => onUpdate(current.id, { snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() }));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!current) {
    return (
      <section className="rounded-panel border border-border bg-card p-8 text-center" aria-label="Inbox processed">
        <Check className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
        <h2 className="m-0 text-xl font-semibold">Inbox zero</h2>
        <p className="mt-2 text-sm text-muted-foreground">All inbox items have been processed.</p>
        <Button className="mt-5" onClick={onClose}>Back to inbox</Button>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl rounded-panel border border-border bg-card p-5 shadow-sm" aria-label="Process inbox">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Process inbox</p>
          <p className="mt-1 text-xs text-muted-foreground">{index + 1} of {queue.length} · P plan · S snooze · D done · X delete</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close inbox processing" onClick={onClose}><X className="h-4 w-4" /></Button>
      </header>
      <h2 className="m-0 text-2xl font-semibold leading-tight">{current.title}</h2>
      {current.description && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{current.description}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => onSchedule(current)}><CalendarClock className="mr-2 h-4 w-4" />Plan</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(() => onUpdate(current.id, { snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() }))}><Clock3 className="mr-2 h-4 w-4" />Snooze 1h</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(() => onComplete(current))}><Check className="mr-2 h-4 w-4" />Done</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void run(() => onDelete(current))}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
      </div>
    </section>
  );
}
