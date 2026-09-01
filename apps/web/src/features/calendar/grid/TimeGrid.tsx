import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { canonicalProjectColor } from '@/lib/project-colors';
import { type TaskColor } from '@/lib/task-colors';
import type { PositionedBlock } from './types';
import { CALENDAR_SLOT_HEIGHT, MINUTES_PER_DAY, SLOT_MINUTES, dayKey, snapMinutes } from './time-grid';

interface Selection {
  start: number;
  end: number;
}

interface CalendarDraft extends Selection {
  timeLabel: string;
}

interface DraftProject {
  id: string;
  name: string;
  color?: string | null;
}

interface DraftColor {
  value: TaskColor;
  label: string;
}

interface Props {
  day: Date;
  blocks: PositionedBlock[];
  startHour?: number;
  endHour?: number;
  draft?: CalendarDraft | null;
  draftInputLabel?: string;
  draftPlaceholder?: string;
  draftSaveLabel?: string;
  draftCancelLabel?: string;
  draftErrorMessage?: string;
  draftProjectLabel?: string;
  draftNoProjectLabel?: string;
  draftProjects?: DraftProject[];
  draftColorLabel?: string;
  draftInheritColorLabel?: string;
  draftColors?: DraftColor[];
  onEmptySelect?: (day: Date, startMinutes: number, endMinutes: number) => void;
  onDraftSubmit?: (title: string, projectId?: string, color?: TaskColor) => Promise<void> | void;
  onDraftCancel?: () => void;
  onTaskDrop?: (taskId: string, day: Date, startMinutes: number) => void;
  onBlockMove?: (blockId: string, day: Date, startMinutes: number) => void;
  onBlockResize?: (blockId: string, endMinutes: number) => void;
  renderBlock: (block: PositionedBlock) => ReactNode;
}

function minutesAtPointer(element: HTMLElement, clientY: number, startHour: number, endHour: number): number {
  const rect = element.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
  return snapMinutes(startHour * 60 + ratio * (endHour - startHour) * 60);
}

/** Renderer-owned time grid: selection, keyboard creation, drop, move and resize. */
export function TimeGrid({
  day,
  blocks,
  startHour = 6,
  endHour = 23,
  draft,
  draftInputLabel = 'Task name',
  draftPlaceholder = 'What will you work on?…',
  draftSaveLabel = 'Create scheduled task',
  draftCancelLabel = 'Cancel scheduled task',
  draftErrorMessage = 'Could not create this scheduled task. Check your connection and try again.',
  draftProjectLabel = 'Project',
  draftNoProjectLabel = 'No project',
  draftProjects = [],
  draftColorLabel = 'Color',
  draftInheritColorLabel = 'Follow project color',
  draftColors = [],
  onEmptySelect,
  onDraftSubmit,
  onDraftCancel,
  onTaskDrop,
  onBlockMove,
  onBlockResize,
  renderBlock,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftProjectId, setDraftProjectId] = useState('');
  const [draftColor, setDraftColor] = useState<TaskColor | ''>('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [keyboardMinute, setKeyboardMinute] = useState(9 * 60);
  const [resizing, setResizing] = useState<{ blockId: string; end: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ minute: number; duration: number; blockId?: string; conflict: boolean } | null>(null);
  const slots = Math.max(1, ((endHour - startHour) * 60) / SLOT_MINUTES);
  const height = slots * CALENDAR_SLOT_HEIGHT;
  const today = dayKey(day) === dayKey(new Date());
  const nowTop = useMemo(() => {
    const now = new Date();
    return ((now.getHours() * 60 + now.getMinutes() - startHour * 60) / ((endHour - startHour) * 60)) * 100;
  }, [startHour, endHour]);

  useEffect(() => {
    if (!draft) return;
    setDraftTitle('');
    setDraftProjectId('');
    setDraftColor('');
    setDraftError(null);
    setDraftSaving(false);
    if (!window.matchMedia || window.matchMedia('(pointer: fine)').matches) {
      const frame = window.requestAnimationFrame(() => draftInputRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
  }, [draft?.end, draft?.start]);

  useEffect(() => {
    if (!resizing) return;
    const move = (event: PointerEvent) => {
      const grid = gridRef.current;
      if (!grid) return;
      const end = minutesAtPointer(grid, event.clientY, startHour, endHour);
      setResizing(current => current
        ? { ...current, end }
        : null);
    };
    const finish = () => {
      setResizing(current => {
        if (current) onBlockResize?.(current.blockId, current.end);
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
    };
  }, [endHour, onBlockResize, resizing?.blockId, startHour]);

  const selectionStyle = selection ? {
    top: `${((Math.min(selection.start, selection.end) - startHour * 60) / ((endHour - startHour) * 60)) * 100}%`,
    height: `${(Math.max(SLOT_MINUTES, Math.abs(selection.end - selection.start)) / ((endHour - startHour) * 60)) * 100}%`,
  } : undefined;
  const dragPreviewStyle = dragPreview ? {
    top: `${((dragPreview.minute - startHour * 60) / ((endHour - startHour) * 60)) * 100}%`,
    height: `${(dragPreview.duration / ((endHour - startHour) * 60)) * 100}%`,
  } : undefined;
  const selectedDraftProject = draftProjects.find(project => project.id === draftProjectId);
  const selectedDraftProjectColor = canonicalProjectColor(selectedDraftProject?.color);
  const inheritedDraftColor = selectedDraftProjectColor
    ? `var(--color-project-${selectedDraftProjectColor})`
    : 'var(--calendar-time-block-accent)';
  const selectedDraftColor = draftColor
    ? `var(--color-project-${draftColor})`
    : inheritedDraftColor;
  const draftStyle = draft ? {
    top: `${((draft.start - startHour * 60) / ((endHour - startHour) * 60)) * 100}%`,
    height: `${(Math.max(SLOT_MINUTES, draft.end - draft.start) / ((endHour - startHour) * 60)) * 100}%`,
    '--calendar-draft-identity-color': selectedDraftColor,
    '--calendar-draft-inherit-color': inheritedDraftColor,
  } as CSSProperties : undefined;

  const submitDraft = async () => {
    const title = draftTitle.trim();
    if (!title || !onDraftSubmit || draftSaving) return;
    setDraftSaving(true);
    setDraftError(null);
    try {
      await onDraftSubmit(title, draftProjectId || undefined, draftColor || undefined);
    } catch {
      setDraftSaving(false);
      setDraftError(draftErrorMessage);
      draftInputRef.current?.focus();
    }
  };

  return (
    <div
      ref={gridRef}
      className={`mindoist-time-grid${today ? ' is-today' : ''}`}
      style={{
        '--grid-height': `${height}px`,
        '--calendar-hour-height': `${CALENDAR_SLOT_HEIGHT * (60 / SLOT_MINUTES)}px`,
        '--calendar-two-hour-height': `${CALENDAR_SLOT_HEIGHT * (120 / SLOT_MINUTES)}px`,
      } as CSSProperties}
      role="gridcell"
      tabIndex={0}
      aria-label={day.toLocaleDateString()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setKeyboardMinute(current => Math.max(startHour * 60, Math.min(endHour * 60 - SLOT_MINUTES, current + (event.key === 'ArrowDown' ? SLOT_MINUTES : -SLOT_MINUTES))));
        } else if ((event.key === 'Enter' || event.key === ' ') && onEmptySelect) {
          event.preventDefault();
          onEmptySelect(day, keyboardMinute, keyboardMinute + 60);
        }
      }}
      onPointerDown={event => {
        if ((event.target as HTMLElement).closest('.mindoist-time-grid-block, .mindoist-calendar-quick-create')) return;
        onDraftCancel?.();
        event.currentTarget.setPointerCapture(event.pointerId);
        const minute = minutesAtPointer(event.currentTarget, event.clientY, startHour, endHour);
        setSelection({ start: minute, end: minute + SLOT_MINUTES });
      }}
      onPointerMove={event => {
        if (!selection || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        // React clears SyntheticEvent.currentTarget after this handler. Read
        // the layout synchronously so the state updater never dereferences a
        // null event target while dragging.
        const end = minutesAtPointer(event.currentTarget, event.clientY, startHour, endHour);
        setSelection(current => current ? { ...current, end } : null);
      }}
      onPointerUp={event => {
        if (!selection) return;
        const end = minutesAtPointer(event.currentTarget, event.clientY, startHour, endHour);
        const from = Math.min(selection.start, end);
        const to = Math.max(from + SLOT_MINUTES, Math.max(selection.start, end));
        setSelection(null);
        onEmptySelect?.(day, from, Math.min(MINUTES_PER_DAY, to));
      }}
      onPointerCancel={() => setSelection(null)}
      onDragOver={event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const durationValue = Number(event.dataTransfer.getData('application/x-task-duration'));
        const duration = Math.max(SLOT_MINUTES, Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 60);
        const minute = Math.min(endHour * 60 - duration, minutesAtPointer(event.currentTarget, event.clientY, startHour, endHour));
        const blockId = event.dataTransfer.getData('application/x-calendar-block') || undefined;
        const conflict = blocks.some(block => {
          if (block.item.kind !== 'block' || block.item.block.id === blockId) return false;
          const start = block.item.start.getHours() * 60 + block.item.start.getMinutes();
          const end = block.item.end.getHours() * 60 + block.item.end.getMinutes();
          return minute < end && minute + duration > start;
        });
        setDragPreview({ minute, duration, blockId, conflict });
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragPreview(null);
      }}
      onDrop={event => {
        event.preventDefault();
        const minute = dragPreview?.minute ?? minutesAtPointer(event.currentTarget, event.clientY, startHour, endHour);
        const taskId = event.dataTransfer.getData('application/x-panel-task');
        const blockId = event.dataTransfer.getData('application/x-calendar-block');
        setDragPreview(null);
        if (taskId) onTaskDrop?.(taskId, day, minute);
        else if (blockId) onBlockMove?.(blockId, day, minute);
      }}
    >
      <div className="mindoist-time-grid-lines" aria-hidden="true">
        {Array.from({ length: slots + 1 }, (_, index) => <span key={index} style={{ top: `${(index / slots) * 100}%` }} />)}
      </div>
      {selectionStyle && <div className="mindoist-calendar-selection" style={selectionStyle} aria-hidden="true" />}
      {draft && draftStyle && (
        <form
          className="mindoist-calendar-quick-create"
          style={draftStyle}
          aria-label={draftSaveLabel}
          aria-busy={draftSaving}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
          onSubmit={event => {
            event.preventDefault();
            void submitDraft();
          }}
        >
          <span className="mindoist-calendar-quick-create-time">{draft.timeLabel}</span>
          <div className="mindoist-calendar-quick-create-row">
            <input
              ref={draftInputRef}
              name="calendar-task-title"
              autoComplete="off"
              maxLength={500}
              aria-label={draftInputLabel}
              placeholder={draftPlaceholder}
              value={draftTitle}
              disabled={draftSaving}
              onChange={event => setDraftTitle(event.target.value)}
              onKeyDown={event => {
                event.stopPropagation();
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onDraftCancel?.();
                }
              }}
            />
            <button type="submit" aria-label={draftSaveLabel} disabled={!draftTitle.trim() || draftSaving}>
              <Check aria-hidden="true" />
            </button>
            <button type="button" aria-label={draftCancelLabel} disabled={draftSaving} onClick={onDraftCancel}>
              <X aria-hidden="true" />
            </button>
          </div>
          {draftProjects.length > 0 && (
            <label className="mindoist-calendar-quick-create-project">
              <span aria-hidden="true" />
              <select
                name="calendar-task-project"
                aria-label={draftProjectLabel}
                value={draftProjectId}
                disabled={draftSaving}
                onChange={event => setDraftProjectId(event.target.value)}
                onKeyDown={event => event.stopPropagation()}
              >
                <option value="">{draftNoProjectLabel}</option>
                {draftProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
          )}
          {draftColors.length > 0 && (
            <div className="mindoist-calendar-quick-create-colors" role="group" aria-label={draftColorLabel}>
              <button
                type="button"
                className={`mindoist-calendar-quick-create-swatch is-inherit${draftColor === '' ? ' is-selected' : ''}`}
                aria-label={draftInheritColorLabel}
                aria-pressed={draftColor === ''}
                title={draftInheritColorLabel}
                disabled={draftSaving}
                onClick={() => setDraftColor('')}
              >
                {draftColor === '' && <Check aria-hidden="true" />}
              </button>
              {draftColors.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`mindoist-calendar-quick-create-swatch task-color-${option.value}${draftColor === option.value ? ' is-selected' : ''}`}
                  aria-label={option.label}
                  aria-pressed={draftColor === option.value}
                  title={option.label}
                  disabled={draftSaving}
                  onClick={() => setDraftColor(option.value)}
                >
                  {draftColor === option.value && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          {draftError && <span className="mindoist-calendar-quick-create-error" role="alert">{draftError}</span>}
        </form>
      )}
      {dragPreviewStyle && <div className={`mindoist-calendar-drag-preview${dragPreview?.conflict ? ' is-conflict' : ''}`} style={dragPreviewStyle} aria-label={dragPreview?.conflict ? 'Scheduling conflict' : 'Schedule preview'} />}
      <div className="mindoist-calendar-keyboard-cursor" style={{ top: `${((keyboardMinute - startHour * 60) / ((endHour - startHour) * 60)) * 100}%` }} aria-hidden="true" />
      {today && nowTop >= 0 && nowTop <= 100 && <div className="mindoist-calendar-now" style={{ top: `${nowTop}%` }} aria-label="Current time" />}
      {blocks.map(block => {
        const item = block.item;
        const blockId = item.kind === 'block' ? item.block.id : null;
        const style = {
          left: `calc(${(block.column / block.columnCount) * 100}% + 2px)`,
          width: `calc(${100 / block.columnCount}% - 4px)`,
          top: block.top,
          height: resizing?.blockId === blockId
            ? Math.max(22, ((resizing.end - (item.start.getHours() * 60 + item.start.getMinutes())) / SLOT_MINUTES) * CALENDAR_SLOT_HEIGHT)
            : block.height,
          '--calendar-identity-color': item.kind === 'block' ? item.identityColor : 'var(--calendar-external-accent)',
        } as CSSProperties;
        return (
          <div
            key={item.id}
            className={`mindoist-time-grid-block${item.kind === 'block' && item.conflict ? ' calendar-conflict-event' : ''}${item.kind === 'block' && item.completed ? ' calendar-task-event-completed' : ''}`}
            style={style}
            draggable={Boolean(blockId)}
            onDragStart={event => {
              if (!blockId) return;
              event.dataTransfer.setData('application/x-calendar-block', blockId);
              const duration = Math.max(SLOT_MINUTES, Math.round((item.end.getTime() - item.start.getTime()) / 60_000));
              event.dataTransfer.setData('application/x-task-duration', String(duration));
              event.dataTransfer.effectAllowed = 'move';
            }}
          >
            {renderBlock(block)}
            {blockId && (
              <button
                type="button"
                className="mindoist-calendar-resize-handle"
                aria-label="Resize planned block"
                onPointerDown={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  setResizing({ blockId, end: item.end.getHours() * 60 + item.end.getMinutes() });
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
