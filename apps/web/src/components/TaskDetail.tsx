import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { X, Clock, Flag, FolderOpen, Repeat, ArrowLeft, Trash2, Plus, Palette, Save, ChevronDown, CornerUpLeft, Timer, GripVertical, CornerDownRight, Check, MoreHorizontal, Tag } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { useDialogA11y } from './ui/dialog';
import { DateRangePicker, TimePicker } from './ui/date-picker';
import { cn } from '@/lib/utils';
import type { Task, UpdateTaskRequest, Tag as TagType } from '@mindoist/shared/types';
import { rruleToPreset, buildRrule } from '@mindoist/shared/recurrence/utils';
import type { RecurrencePreset } from '@mindoist/shared/recurrence/utils';
import { PomodoroTimer } from './PomodoroTimer';
import { DueCountdown } from './DueCountdown';
import { TASK_COLOR_OPTIONS, taskColorClass } from '@/lib/task-colors';
import { featureFlags } from '@/lib/feature-flags';
import { TaskScheduleEditor } from '@/features/tasks/detail/TaskScheduleEditor';
import { useTaskAutosave } from '@/features/tasks/detail/use-task-autosave';

export interface TaskInspectorProps {
  task: Task;
  projects: { id: string; name: string; color?: string | null }[];
  tags: TagType[];
  onSave: (id: string, req: UpdateTaskRequest) => Promise<void> | void;
  onAutosave?: (id: string, req: UpdateTaskRequest) => Promise<void> | void;
  onCompletePomodoro: (id: string) => Promise<Task>;
  onClose: () => void;
  onDelete: (id: string) => void;
  onDeleteWithUndo?: (task: Task) => Promise<void>;
  onSelectTask?: (task: Task) => void;
  onTasksChanged?: () => void;
  onColorPreview?: (color: string) => void;
  rail?: boolean;
  pomodoroWorkMinutes?: number;
  pomodoroBreakMinutes?: number;
}

// Fixed DD/MM/YYYY HH:mm display, matching the date-picker's format — not
// `toLocaleString()`, which renders in the browser's default locale (e.g.
// en-US M/D/YYYY) regardless of the app's own language setting.
function formatDateTimeDisplay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function authHeaders(): Record<string, string> | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function TaskInspector({
  task, projects, tags, onSave, onAutosave, onCompletePomodoro, onClose, onDelete, onDeleteWithUndo,
  onSelectTask, onTasksChanged, onColorPreview, rail = false,
  pomodoroWorkMinutes, pomodoroBreakMinutes,
}: TaskInspectorProps) {
  const { t } = useTranslation('tasks');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [color, setColor] = useState(task.color || '');
  const [dueDate, setDueDate] = useState(
    task.deadline?.date || task.dueDate?.slice(0, 10) || '',
  );
  const [dueTime, setDueTime] = useState(task.deadline?.time || task.dueTime || '');
  const [startDate, setStartDate] = useState(task.startDate?.slice(0, 10) || '');
  const [priority, setPriority] = useState<number | null>(task.priority);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const priorityRef = useRef<HTMLDivElement>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [projectId, setProjectId] = useState(task.projectId || '');
  const [tagIds, setTagIds] = useState<string[]>(task.tagIds);
  const selectedTags = useMemo(
    () => tagIds
      .map(id => tags.find(tag => tag.id === id))
      .filter((tag): tag is TagType => Boolean(tag)),
    [tagIds, tags],
  );
  const tagSummary = selectedTags.length > 0
    ? `${selectedTags[0].name}${tagIds.length > 1 ? ` +${tagIds.length - 1}` : ''}`
    : t('detail.noTags');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDueOverdue = useMemo(() => {
    if (!dueDate || task.completedAt) return false;
    const target = new Date(`${dueDate}T${dueTime || '23:59'}:00`).getTime();
    return !Number.isNaN(target) && target < Date.now();
  }, [dueDate, dueTime, task.completedAt]);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  // A late initial GET must not overwrite a completion the user just made.
  // This occurred most often immediately after opening the inspector, when
  // the subtask request and a checkbox mutation crossed in flight.
  const subtaskMutationVersion = useRef(0);
  const [newSubtask, setNewSubtask] = useState('');
  const formId = `task-detail-form-${task.id}`;
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [draggedSubtaskId, setDraggedSubtaskId] = useState<string | null>(null);
  const [dragOverSubtaskId, setDragOverSubtaskId] = useState<string | null>(null);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const discardConfirmDialogRef = useDialogA11y({
    open: showDiscardConfirm,
    onClose: () => setShowDiscardConfirm(false),
  });
  const deleteConfirmDialogRef = useDialogA11y({
    open: showDeleteConfirm,
    onClose: () => setShowDeleteConfirm(false),
  });
  const completeConfirmDialogRef = useDialogA11y({
    open: showCompleteConfirm,
    onClose: () => setShowCompleteConfirm(false),
  });
  const [checklistItems, setChecklistItems] = useState<{ id: string; title: string; completedAt: string | null; sortOrder: number }[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [addingChecklistItem, setAddingChecklistItem] = useState(false);
  const [reminders, setReminders] = useState<{ id: string; remindAt: string; type: string; isSent: boolean }[]>([]);
  const [reminderMenuOpen, setReminderMenuOpen] = useState(false);
  const [customReminderTime, setCustomReminderTime] = useState('');
  const reminderMenuRef = useRef<HTMLDivElement>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const recurrenceRef = useRef<HTMLDivElement>(null);
  const [durationMin, setDurationMin] = useState(task.durationMin ?? '');
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>(() => rruleToPreset(task.rrule));
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [customRrule, setCustomRrule] = useState(() => (rruleToPreset(task.rrule) === 'custom' ? task.rrule || '' : ''));
  const [recurrenceBasis, setRecurrenceBasis] = useState<'DUE_DATE' | 'COMPLETION_DATE'>(task.recurrenceBasis || 'DUE_DATE');
  const [recurringResetMode, setRecurringResetMode] = useState<'RESET' | 'KEEP'>(task.recurringResetMode || 'RESET');

  useEffect(() => {
    let cancelled = false;
    const requestVersion = subtaskMutationVersion.current;
    const headers = authHeaders();
    if (!headers) return;
    fetch(`/tasks/${task.id}/subtasks`, { headers })
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.success && requestVersion === subtaskMutationVersion.current) {
          setSubtasks(d.data as Task[]);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [task.id]);

  useEffect(() => {
    let cancelled = false;
    const headers = authHeaders();
    if (!headers) return;
    fetch(`/tasks/${task.id}/checklist-items`, { headers })
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.success) {
          setChecklistItems(d.data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [task.id]);

  useEffect(() => {
    let cancelled = false;
    const headers = authHeaders();
    if (!headers) return;
    fetch(`/tasks/${task.id}/reminders`, { headers })
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.success) {
          setReminders(d.data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [task.id]);

  useEffect(() => {
    if (!reminderMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (reminderMenuRef.current && !reminderMenuRef.current.contains(e.target as Node)) {
        setReminderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [reminderMenuOpen]);

  useEffect(() => {
    if (!taskMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (taskMenuRef.current && !taskMenuRef.current.contains(event.target as Node)) {
        setTaskMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showDeleteConfirm) setTaskMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showDeleteConfirm, taskMenuOpen]);

  const handleAddReminder = useCallback(async (offsetMs: number) => {
    const headers = authHeaders();
    if (!headers) return;
    const dueBase = dueDate
      ? new Date(`${dueDate}T${dueTime || '09:00'}:00`)
      : new Date();
    const remindAt = new Date(dueBase.getTime() - offsetMs);
    try {
      const res = await fetch(`/tasks/${task.id}/reminders`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ remindAt: remindAt.toISOString() }),
      });
      const body = await res.json();
      if (body.success) {
        setReminders(prev => [...prev, body.data].sort((a, b) => a.remindAt.localeCompare(b.remindAt)));
      }
    } catch {}
    setReminderMenuOpen(false);
  }, [task.id, dueDate, dueTime]);

  const handleAddCustomReminder = useCallback(async () => {
    if (!customReminderTime) return;
    const headers = authHeaders();
    if (!headers) return;
    const remindAt = new Date(customReminderTime);
    if (Number.isNaN(remindAt.getTime())) return;
    try {
      const res = await fetch(`/tasks/${task.id}/reminders`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ remindAt: remindAt.toISOString() }),
      });
      const body = await res.json();
      if (body.success) {
        setReminders(prev => [...prev, body.data].sort((a, b) => a.remindAt.localeCompare(b.remindAt)));
      }
    } catch {}
    setCustomReminderTime('');
    setReminderMenuOpen(false);
  }, [task.id, customReminderTime]);

  const handleDeleteReminder = useCallback(async (reminderId: string) => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      await fetch(`/reminders/${reminderId}`, { method: 'DELETE', headers });
      setReminders(prev => prev.filter(r => r.id !== reminderId));
    } catch {}
  }, []);

  const handleAddSubtask = useCallback(async () => {
    const subtaskTitle = newSubtask.trim();
    const headers = authHeaders();
    if (!subtaskTitle || !headers) return;
    setAddingSubtask(true);
    try {
      const res = await fetch('/tasks', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: subtaskTitle, parentId: task.id }),
      });
      const body = await res.json();
      if (body.success) {
        setSubtasks(prev => [...prev, body.data]);
        setNewSubtask('');
        onTasksChanged?.();
      }
    } catch {
      // keep input so the user can retry
    } finally {
      setAddingSubtask(false);
    }
  }, [newSubtask, task.id, onTasksChanged]);

  const handlePromoteSubtask = useCallback(async (subtask: Task) => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      const res = await fetch(`/tasks/${subtask.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: null }),
      });
      const body = await res.json();
      if (body.success) {
        setSubtasks(prev => prev.filter(st => st.id !== subtask.id));
        onTasksChanged?.();
      }
    } catch {
      // leave state unchanged on failure
    }
  }, [onTasksChanged]);

  const handleToggleSubtask = useCallback(async (subtask: Task) => {
    const headers = authHeaders();
    if (!headers) return;
    const endpoint = subtask.completedAt ? 'reopen' : 'complete';
    const mutationVersion = ++subtaskMutationVersion.current;
    const optimisticTask = {
      ...subtask,
      completedAt: subtask.completedAt ? null : new Date().toISOString(),
    };
    setSubtasks(prev => prev.map(st => st.id === subtask.id ? optimisticTask : st));
    try {
      const res = await fetch(`/tasks/${subtask.id}/${endpoint}`, { method: 'POST', headers });
      const body = await res.json();
      if (body.success && mutationVersion === subtaskMutationVersion.current) {
        setSubtasks(prev => prev.map(st => st.id === subtask.id ? body.data : st));
        onTasksChanged?.();
      } else if (mutationVersion === subtaskMutationVersion.current) {
        setSubtasks(prev => prev.map(st => st.id === subtask.id ? subtask : st));
      }
    } catch {
      if (mutationVersion === subtaskMutationVersion.current) {
        setSubtasks(prev => prev.map(st => st.id === subtask.id ? subtask : st));
      }
    }
  }, [onTasksChanged]);

  const handleInlineEditStart = useCallback((subtask: Task) => {
    setEditingSubtaskId(subtask.id);
    setEditingTitle(subtask.title);
  }, []);

  const handleInlineEditSave = useCallback(async (subtask: Task) => {
    const trimmed = editingTitle.trim();
    if (!trimmed || trimmed === subtask.title) {
      setEditingSubtaskId(null);
      return;
    }
    const headers = authHeaders();
    if (!headers) return;
    try {
      const res = await fetch(`/tasks/${subtask.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      const body = await res.json();
      if (body.success) {
        setSubtasks(prev => prev.map(st => st.id === subtask.id ? body.data : st));
      }
    } catch { /* keep editing state */ }
    setEditingSubtaskId(null);
  }, [editingTitle]);

  const handleDeleteSubtask = useCallback(async (subtask: Task) => {
    const headers = authHeaders();
    if (!headers) return;
    if (onDeleteWithUndo) {
      await onDeleteWithUndo(subtask);
    } else {
      await fetch(`/tasks/${subtask.id}`, { method: 'DELETE', headers });
    }
    setSubtasks(prev => prev.filter(st => st.id !== subtask.id));
    onTasksChanged?.();
  }, [onDeleteWithUndo, onTasksChanged]);

  const handleDemoteSubtask = useCallback(async (subtask: Task) => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      const res = await fetch(`/tasks/${subtask.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: task.id }),
      });
      const body = await res.json();
      if (body.success) {
        setSubtasks(prev => prev.filter(st => st.id !== subtask.id));
        onTasksChanged?.();
      }
    } catch { /* keep state */ }
  }, [task.id, onTasksChanged]);

  const handleCompleteParent = useCallback(async () => {
    setShowCompleteConfirm(false);
    const headers = authHeaders();
    if (!headers) return;
    const endpoint = task.completedAt ? 'reopen' : 'complete';
    try {
      const res = await fetch(`/tasks/${task.id}/${endpoint}`, { method: 'POST', headers });
      const body = await res.json();
      if (body.success) {
        onTasksChanged?.();
        // Completing/reopening moves the task out of most smart-list views
        // (and, for a recurring task, spawns a new occurrence with a new id)
        // so the panel would otherwise keep showing this now-stale task
        // forever until the user manually closes or picks another one.
        onClose();
      }
    } catch { /* noop */ }
  }, [task.id, task.completedAt, onTasksChanged, onClose]);

  const handleSubtaskDragStart = useCallback((subtask: Task, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-subtask-drag', subtask.id);
    e.currentTarget.closest('[data-testid^="subtask-"]')?.classList.add('select-none');
    setDraggedSubtaskId(subtask.id);
  }, []);

  const handleSubtaskDragOver = useCallback((subtask: Task, e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-subtask-drag')) return;
    e.preventDefault();
    if (draggedSubtaskId && draggedSubtaskId !== subtask.id) setDragOverSubtaskId(subtask.id);
  }, [draggedSubtaskId]);

  const handleSubtaskDrop = useCallback(async (targetSubtask: Task, e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/x-subtask-drag') || draggedSubtaskId;
    setDraggedSubtaskId(null);
    setDragOverSubtaskId(null);
    if (!draggedId || draggedId === targetSubtask.id) return;

    const dragIdx = subtasks.findIndex(s => s.id === draggedId);
    const dropIdx = subtasks.findIndex(s => s.id === targetSubtask.id);
    if (dragIdx === -1 || dropIdx === -1) return;

    const reordered = [...subtasks];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);

    setSubtasks(reordered);

    const headers = authHeaders();
    if (!headers) return;
    for (let i = 0; i < reordered.length; i++) {
      await fetch(`/tasks/${reordered[i].id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: i }),
      });
    }
    onTasksChanged?.();
  }, [subtasks, draggedSubtaskId, onTasksChanged]);

  const hasIncompleteSubtasks = useMemo(
    () => subtasks.some(st => !st.completedAt),
    [subtasks],
  );

  // --- Checklist handlers ---

  const handleAddChecklistItem = useCallback(async () => {
    const title = newChecklistItem.trim();
    if (!title || addingChecklistItem) return;
    const headers = authHeaders();
    if (!headers) return;
    setAddingChecklistItem(true);
    try {
      const res = await fetch(`/tasks/${task.id}/checklist-items`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const d = await res.json();
      if (d.success) {
        setChecklistItems(prev => [...prev, d.data]);
        setNewChecklistItem('');
        onTasksChanged?.();
      }
    } finally {
      setAddingChecklistItem(false);
    }
  }, [task.id, newChecklistItem, addingChecklistItem, onTasksChanged]);

  const handleToggleChecklistItem = useCallback(async (item: { id: string; completedAt: string | null }) => {
    const headers = authHeaders();
    if (!headers) return;
    const newCompletedAt = item.completedAt ? null : new Date().toISOString();
    const res = await fetch(`/checklist-items/${item.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedAt: newCompletedAt }),
    });
    const d = await res.json();
    if (d.success) {
      setChecklistItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, completedAt: newCompletedAt } : ci));
      onTasksChanged?.();
    }
  }, [onTasksChanged]);

  const handleDeleteChecklistItem = useCallback(async (itemId: string) => {
    const headers = authHeaders();
    if (!headers) return;
    await fetch(`/checklist-items/${itemId}`, { method: 'DELETE', headers });
    setChecklistItems(prev => prev.filter(ci => ci.id !== itemId));
    onTasksChanged?.();
  }, [onTasksChanged]);

  const handleChecklistDragStart = useCallback((item: { id: string }, e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-checklist-drag', item.id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleChecklistDragOver = useCallback((targetItem: { id: string }, e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-checklist-drag')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleChecklistDrop = useCallback(async (targetItem: { id: string }, e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/x-checklist-drag');
    if (!draggedId || draggedId === targetItem.id) return;
    const dragIdx = checklistItems.findIndex(ci => ci.id === draggedId);
    const dropIdx = checklistItems.findIndex(ci => ci.id === targetItem.id);
    if (dragIdx === -1 || dropIdx === -1) return;
    const reordered = [...checklistItems];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    setChecklistItems(reordered);
    const headers = authHeaders();
    if (!headers) return;
    for (let i = 0; i < reordered.length; i++) {
      await fetch(`/checklist-items/${reordered[i].id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: i }),
      });
    }
    onTasksChanged?.();
  }, [checklistItems, onTasksChanged]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setColor(task.color || '');
    setDueDate(task.deadline?.date || task.dueDate?.slice(0, 10) || '');
    setDueTime(task.deadline?.time || task.dueTime || '');
    setStartDate(task.startDate?.slice(0, 10) || '');
    setPriority(task.priority);
    setProjectId(task.projectId || '');
    setTagIds(task.tagIds);
    setDurationMin(task.durationMin ?? '');
    setRecurrencePreset(rruleToPreset(task.rrule));
    setCustomRrule(rruleToPreset(task.rrule) === 'custom' ? task.rrule || '' : '');
    setRecurrenceBasis(task.recurrenceBasis || 'DUE_DATE');
    setRecurringResetMode(task.recurringResetMode || 'RESET');
    setDirty(false);
    setError(null);
  }, [task.id]);

  // Opening the inspector must not put a caret in the title: the rail is a
  // reading surface first, and stealing focus made every task click look like
  // a rename. Editing starts when the user clicks the field.

  const isDirty = dirty || title !== task.title || description !== (task.description || '') ||
    color !== (task.color || '') ||
    dueDate !== (task.deadline?.date || task.dueDate?.slice(0, 10) || '') ||
    dueTime !== (task.deadline?.time || task.dueTime || '') ||
    startDate !== (task.startDate?.slice(0, 10) || '') ||
    priority !== task.priority || projectId !== (task.projectId || '') ||
    [...tagIds].sort().join(',') !== [...task.tagIds].sort().join(',') ||
    durationMin !== (task.durationMin ?? '') ||
    buildRrule(recurrencePreset, customRrule) !== (task.rrule || null) ||
    recurrenceBasis !== (task.recurrenceBasis || 'DUE_DATE') ||
    recurringResetMode !== (task.recurringResetMode || 'RESET');

  const handleChange = useCallback(() => setDirty(true), []);

  const taskDraft = useMemo<UpdateTaskRequest>(() => ({
    title: title.trim(),
    description: description.trim() || undefined,
    color: color || null,
    deadline: featureFlags.taskDetailV2
      ? dueDate
        ? {
            date: dueDate,
            ...(dueTime
              ? {
                  time: dueTime,
                  timeZone:
                    task.deadline?.timeZone ||
                    Intl.DateTimeFormat().resolvedOptions().timeZone ||
                    'UTC',
                }
              : {}),
          }
        : null
      : undefined,
    dueDate: dueDate || null,
    dueTime: dueTime || null,
    startDate: startDate || null,
    priority,
    projectId: projectId || null,
    tagIds,
    durationMin: durationMin !== '' ? Number(durationMin) : null,
    rrule: buildRrule(recurrencePreset, customRrule) || null,
    recurrenceBasis,
    recurringResetMode,
  }), [
    color,
    customRrule,
    description,
    dueDate,
    dueTime,
    durationMin,
    priority,
    projectId,
    recurrenceBasis,
    recurrencePreset,
    recurringResetMode,
    startDate,
    tagIds,
    task.deadline?.timeZone,
    title,
  ]);

  const saveDraft = useCallback(
    async (draft: UpdateTaskRequest) => {
      await (onAutosave ?? onSave)(task.id, draft);
    },
    [onAutosave, onSave, task.id],
  );
  const autosave = useTaskAutosave({
    enabled: featureFlags.taskDetailV2,
    taskId: task.id,
    dirty: isDirty && Boolean(title.trim()),
    draft: taskDraft,
    initialDraft: taskDraft,
    save: saveDraft,
    onSaved: () => setDirty(false),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(task.id, taskDraft);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('detail.save'));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isDirty, onClose]);
  // The modal variant still has to move focus inside itself, but it lands on
  // the panel — announced with its dialog label — rather than in the title.
  const inspectorSurfaceRef = useRef<HTMLDivElement>(null);
  const inspectorDialogRef = useDialogA11y<HTMLDivElement>({
    open: !rail,
    onClose: handleClose,
    initialFocusRef: inspectorSurfaceRef,
  });
  const setInspectorRef = useCallback((node: HTMLDivElement | null) => {
    inspectorDialogRef.current = node;
    inspectorSurfaceRef.current = node;
  }, [inspectorDialogRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  useEffect(() => {
    if (!colorOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setColorOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setColorOpen(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [colorOpen]);

  useEffect(() => {
    if (!priorityOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) {
        setPriorityOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setPriorityOpen(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    // Capture phase so this beats the panel's own Escape-closes-panel listener.
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [priorityOpen]);

  useEffect(() => {
    if (!tagsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tagsRef.current && !tagsRef.current.contains(e.target as Node)) {
        setTagsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setTagsOpen(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [tagsOpen]);

  useEffect(() => {
    if (!recurrenceOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (recurrenceRef.current && !recurrenceRef.current.contains(e.target as Node)) {
        setRecurrenceOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setRecurrenceOpen(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [recurrenceOpen]);

  return (
    <motion.div
      className={cn(
        rail && 'flex min-h-0 flex-1',
        !rail && 'fixed inset-0 z-[70] flex justify-end',
      )}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', damping: 28, stiffness: 340 }}
    >
      <div
        ref={setInspectorRef}
        data-testid="task-detail"
        role={rail ? undefined : 'dialog'}
        aria-modal={rail ? undefined : 'true'}
        aria-label={rail ? undefined : t('detail.taskDetails')}
        tabIndex={rail ? undefined : -1}
        className={cn(
          "focus-silent flex flex-col overflow-hidden border-l border-border bg-card",
          "w-full md:w-[26rem] md:shrink-0",
          "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-[70] max-xl:shadow-2xl",
          "max-md:inset-0",
          rail && "h-full min-h-0 border-l-0 md:w-full md:shrink"
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
          <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
              size="icon"
              data-testid="detail-close"
              onClick={handleClose}
              aria-label={t('detail.close')}
              className="h-11 w-11 md:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <h3 className="m-0 text-xs font-semibold text-muted-foreground">{t('detail.title')}</h3>
            {task.rrule && (
              <span
                data-testid="detail-repeat-badge"
                className="flex items-center gap-1 text-xs text-muted-foreground"
                aria-label={t('repeatBadge')}
              >
                <Repeat className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="submit"
              form={formId}
              variant="ghost"
              size="icon"
              data-testid="detail-save-header"
              disabled={saving || !title.trim()}
              aria-label={t('detail.save')}
              aria-busy={saving}
              title={t('detail.save')}
              className={cn(
                "h-11 w-11 xl:h-7 xl:w-7",
                isDirty && !saving && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <div className="relative" ref={taskMenuRef}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTaskMenuOpen(open => !open)}
                aria-label={t('detail.moreActions')}
                aria-haspopup="menu"
                aria-expanded={taskMenuOpen}
                className="h-11 w-11 xl:h-7 xl:w-7"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
              {taskMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[80] min-w-40 rounded-panel border border-border bg-card p-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setShowDeleteConfirm(true)}
                    aria-label={t('detail.delete')}
                    className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-8"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('detail.delete')}
                  </button>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              data-testid="detail-close-desktop"
              onClick={handleClose}
              aria-label={t('detail.close')}
              className="hidden h-11 w-11 md:inline-flex xl:h-7 xl:w-7"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <form id={formId} onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex flex-1 flex-col gap-3 p-3.5">
            {/* Title */}
            <div className="border-b border-border/70 pb-2 flex items-center gap-2">
              <Checkbox
                data-testid="detail-title-complete"
                checked={!!task.completedAt}
                aria-label={task.completedAt ? t('detail.reopen') : t('detail.complete')}
                onCheckedChange={() => {
                  if (!task.completedAt && hasIncompleteSubtasks) {
                    setShowCompleteConfirm(true);
                  } else {
                    void handleCompleteParent();
                  }
                }}
              />
              <textarea
                ref={titleRef}
                data-testid="detail-title"
                value={title}
                onChange={e => { setTitle(e.target.value); handleChange(); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={t('detail.editTitle')}
                rows={1}
                className={cn(
                  'focus-soft max-h-[4.5rem] min-h-6 flex-1 resize-none overflow-y-auto rounded-control border border-transparent bg-transparent px-1.5 -mx-1.5 text-base font-semibold leading-6 [field-sizing:content] transition-[border-color,box-shadow,background-color] duration-150 hover:border-border/40 focus-visible:bg-background',
                  task.completedAt && 'text-muted-foreground line-through',
                )}
              />
            </div>

            {/* Description — right under the title (D4), auto-growing so it
                reads as the primary writing surface, not an afterthought. */}
            <div className="border-b border-border/70 pb-2">
              <textarea
                data-testid="detail-description"
                value={description}
                onChange={e => { setDescription(e.target.value); handleChange(); }}
                placeholder={t('detail.descriptionPlaceholder')}
                rows={2}
                className="focus-soft min-h-12 max-h-40 w-full resize-y rounded-control border border-transparent bg-transparent px-2.5 py-2 text-sm [field-sizing:content] transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:bg-background"
              />
            </div>

            {featureFlags.taskDetailV2 && (
              <TaskScheduleEditor
                deadlineDate={dueDate}
                deadlineTime={dueTime}
                onDeadlineDateChange={value => {
                  setDueDate(value);
                  handleChange();
                }}
                onDeadlineTimeChange={value => {
                  setDueTime(value);
                  handleChange();
                }}
              />
            )}

            {/* Compact properties: frequent values remain visible, while the
                full color palette opens on demand instead of occupying a row. */}
            <div className="flex flex-col gap-1 border-b border-border/70 pb-2">
              <div className="flex flex-wrap items-center gap-1">
                {/* Color */}
                <div ref={colorRef} className="relative shrink-0">
                  <button
                    type="button"
                    data-testid="detail-color"
                    aria-label={color
                      ? t(TASK_COLOR_OPTIONS.find(option => option.value === color)?.labelKey ?? 'detail.noColor')
                      : t('detail.noColor')}
                    aria-haspopup="listbox"
                    aria-expanded={colorOpen}
                    onClick={() => setColorOpen(open => !open)}
                    className={cn(
                      "task-color-swatch flex h-7 w-7 items-center justify-center rounded-full border border-border/60 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      color ? taskColorClass(color) : "bg-background",
                    )}
                  >
                    <Palette className={cn("h-3.5 w-3.5", color ? "text-white" : "text-muted-foreground")} aria-hidden="true" />
                  </button>
                  {colorOpen && (
                    <div
                      role="listbox"
                      className="frosted-surface absolute left-0 top-full z-50 mt-1 flex items-center gap-1.5 rounded-panel border border-border bg-card p-2 shadow-lg"
                    >
                      <button
                        type="button"
                        role="option"
                        aria-label={t('detail.noColor')}
                        aria-selected={!color}
                        onClick={() => {
                          setColor('');
                          setColorOpen(false);
                          handleChange();
                          onColorPreview?.('');
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[0.55rem] font-medium text-muted-foreground transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {!color ? <Check className="h-3 w-3" /> : '—'}
                      </button>
                      {TASK_COLOR_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          data-testid={`detail-color-${option.value}`}
                          aria-label={t(option.labelKey)}
                          aria-selected={color === option.value}
                          onClick={() => {
                            setColor(option.value);
                            setColorOpen(false);
                            handleChange();
                            onColorPreview?.(option.value);
                          }}
                          className={cn(
                            'task-color-swatch flex h-5 w-5 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            taskColorClass(option.value)
                          )}
                        >
                          {color === option.value && <Check className="h-3 w-3 text-white" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Priority */}
                <div ref={priorityRef} className="relative shrink-0">
                  <button
                    type="button"
                    data-testid="detail-priority"
                    onClick={() => setPriorityOpen(o => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={priorityOpen}
                    title={priority != null ? t(`calendar.priority${priority}`) : t('detail.noPriority')}
                    style={priority != null ? { color: `var(--color-p${priority})` } : undefined}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-control border border-border/60 bg-background px-2 text-xs font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      priority == null && 'font-normal text-muted-foreground'
                    )}
                  >
                    <Flag className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate text-left">
                      {priority != null ? `P${priority}` : '—'}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>

                  {priorityOpen && (
                    <div
                      className="frosted-surface absolute left-0 z-50 mt-1 w-full min-w-[11rem] rounded-panel border border-border bg-card p-1 shadow-lg"
                      role="listbox"
                      aria-label={t('detail.priority')}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={priority == null}
                        onClick={() => { setPriority(null); handleChange(); setPriorityOpen(false); }}
                        className={cn(
                          'flex w-full items-center rounded-control px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                          priority == null && 'bg-muted font-medium'
                        )}
                      >
                        {t('detail.noPriority')}
                      </button>
                      {[1, 2, 3, 4].map(p => (
                        <button
                          key={p}
                          type="button"
                          role="option"
                          data-testid={`detail-priority-${p}`}
                          aria-selected={priority === p}
                          onClick={() => { setPriority(p); handleChange(); setPriorityOpen(false); }}
                          style={{ color: `var(--color-p${p})` }}
                          className={cn(
                            'flex w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted',
                            priority === p && 'bg-muted'
                          )}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--color-p${p})` }} />
                          {t(`calendar.priority${p}`)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Project */}
                <div className="flex h-7 shrink-0 items-center gap-1 rounded-control border border-border/60 bg-background pl-1.5">
                  <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <Select
                    value={projectId}
                    options={[
                      { value: '', label: t('detail.noProject') },
                      ...projects.map(p => ({ value: p.id, label: p.name })),
                    ]}
                    onChange={val => { setProjectId(val); handleChange(); }}
                    data-testid="detail-project"
                    size="sm"
                    align="left"
                    className="w-auto min-w-0 max-w-[9rem]"
                    triggerClassName="border-none bg-transparent px-1.5 hover:bg-transparent"
                  />
                </div>

                {/* Tags */}
                <div ref={tagsRef} className="relative shrink-0">
                  <button
                    type="button"
                    data-testid="detail-tags"
                    onClick={() => setTagsOpen(o => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={tagsOpen}
                    title={selectedTags.map(tag => tag.name).join(', ') || t('detail.noTags')}
                    className={cn(
                      'flex h-7 max-w-[11rem] items-center gap-1.5 rounded-control border border-border/60 bg-background px-2 text-xs font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      tagIds.length === 0 && 'font-normal text-muted-foreground'
                    )}
                  >
                    <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate text-left">
                      {tagSummary}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>

                  {tagsOpen && (
                    <div
                      className="frosted-surface absolute left-0 z-50 mt-1 w-full min-w-[11rem] max-h-60 overflow-y-auto rounded-panel border border-border bg-card p-1 shadow-lg"
                      role="listbox"
                      aria-label={t('sidebar.tags')}
                    >
                      {tags.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('list.empty')}</p>
                      ) : (
                        tags.map(tag => {
                          const selected = tagIds.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              role="option"
                              data-testid={`detail-tag-${tag.id}`}
                              aria-selected={selected}
                              onClick={() => {
                                setTagIds(prev => selected ? prev.filter(id => id !== tag.id) : [...prev, tag.id]);
                                handleChange();
                              }}
                              className={cn(
                                'flex w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                                selected && 'bg-muted font-medium'
                              )}
                            >
                              <Check className={cn('h-3 w-3 shrink-0', !selected && 'opacity-0')} aria-hidden="true" />
                              <span className="truncate">#{tag.name}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Recurrence */}
                <div
                  ref={recurrenceRef}
                  className={cn(
                    "relative shrink-0",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setRecurrenceOpen(open => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={recurrenceOpen}
                    aria-label={t('detail.recurrence')}
                    data-testid="detail-recurrence-select"
                    data-value={recurrencePreset || ''}
                    title={recurrencePreset
                      ? `${t('detail.recurrence')}: ${recurrencePreset}`
                      : t('detail.noRecurrence')}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-control border border-input bg-background transition-colors hover:border-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      recurrencePreset && "text-primary",
                    )}
                  >
                    <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {recurrenceOpen && (
                    <div
                      role="listbox"
                      aria-label={t('detail.recurrence')}
                      className="frosted-surface absolute right-0 top-full z-50 mt-1 w-44 rounded-panel border border-border bg-card p-1 shadow-lg shadow-black/10 dark:shadow-black/30"
                    >
                      {[
                        { value: '', label: t('detail.noRecurrence') },
                        { value: 'daily', label: t('detail.repeatDaily', 'Daily') },
                        { value: 'weekdays', label: t('detail.repeatWeekdays', 'Weekdays') },
                        { value: 'weekly', label: t('detail.repeatWeekly', 'Weekly') },
                        { value: 'biweekly', label: t('detail.repeatBiweekly', 'Every 2 weeks') },
                        { value: 'monthly', label: t('detail.repeatMonthly', 'Monthly') },
                        { value: 'yearly', label: t('detail.repeatYearly', 'Yearly') },
                        { value: 'custom', label: t('detail.repeatCustom', 'Custom RRULE') },
                      ].map(option => {
                        const selected = (recurrencePreset || '') === option.value;
                        return (
                          <button
                            key={option.value || 'none'}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setRecurrencePreset((option.value || null) as RecurrencePreset);
                              setRecurrenceOpen(false);
                              handleChange();
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selected && "bg-muted font-medium",
                            )}
                          >
                            <Check className={cn("h-3 w-3 shrink-0", !selected && "opacity-0")} aria-hidden="true" />
                            <span className="truncate">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Date + time */}
                <div className={cn("contents", featureFlags.taskDetailV2 && "hidden")}>
                  <DateRangePicker
                    startValue={startDate}
                    dueValue={dueDate}
                    onStartChange={val => { setStartDate(val); handleChange(); }}
                    onDueChange={val => { setDueDate(val); handleChange(); }}
                    startTestId="detail-start-date"
                    dueTestId="detail-due-date"
                    startLabel={t('detail.startDate') || 'From'}
                    dueLabel={t('detail.dueDate')}
                    todayLabel={t('detail.setToday')}
                    clearLabel={t('detail.clear') || 'Clear'}
                    dueIsOverdue={isDueOverdue}
                    compact
                  />
                  <TimePicker
                    value={dueTime}
                    onChange={val => { setDueTime(val); handleChange(); }}
                    testId="detail-due-time"
                    className="shrink-0"
                    ariaLabel={t('detail.dueTime')}
                  />
                </div>

                {/* Duration */}
                <div className={cn(
                  "flex h-7 shrink-0 items-center gap-0.5 rounded-control border border-input bg-background px-1.5 transition-colors hover:border-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                )}>
                  <Timer className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="number"
                    min={0}
                    value={durationMin}
                    onChange={e => { setDurationMin(e.target.value === '' ? '' : Number(e.target.value)); handleChange(); }}
                    placeholder="—"
                    aria-label={t('detail.duration', 'Duration')}
                    className="w-7 bg-transparent text-right text-xs outline-none"
                    data-testid="detail-duration-min"
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              </div>

              {/* Overdue is already communicated by the red due-date field above —
                  only show the countdown for upcoming/critical/soon urgency. */}
              {dueDate && !isDueOverdue && (
                <DueCountdown
                  dueDate={dueDate}
                  dueTime={dueTime || null}
                  completedAt={task.completedAt}
                  testId="detail-due-countdown"
                />
              )}

              {/* Custom RRULE text input — only when the "Custom" preset is picked */}
              {recurrencePreset === 'custom' && (
                <div className="flex items-center gap-2">
                  <label className="w-16 shrink-0 text-xs text-muted-foreground">{t('detail.customRrule', 'RRULE')}</label>
                  <Input
                    value={customRrule}
                    onChange={e => { setCustomRrule(e.target.value); handleChange(); }}
                    placeholder="FREQ=DAILY;INTERVAL=3"
                    spellCheck={false}
                    className="h-7 flex-1 border-border/70 bg-background font-mono text-xs"
                    data-testid="detail-custom-rrule"
                  />
                </div>
              )}
              {/* Recurrence basis (B2.9b) + reset mode (B2.9) share a row — only when recurrence is set */}
              {recurrencePreset && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-muted-foreground">{t('detail.basis', 'Basis')}</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        data-testid="detail-basis-due"
                        onClick={() => { setRecurrenceBasis('DUE_DATE'); handleChange(); }}
                        className={cn(
                          'rounded-control px-2 py-0.5 text-xs transition-colors',
                          recurrenceBasis === 'DUE_DATE'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {t('detail.basisDueDate', 'Due date')}
                      </button>
                      <button
                        type="button"
                        data-testid="detail-basis-completion"
                        onClick={() => { setRecurrenceBasis('COMPLETION_DATE'); handleChange(); }}
                        className={cn(
                          'rounded-control px-2 py-0.5 text-xs transition-colors',
                          recurrenceBasis === 'COMPLETION_DATE'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {t('detail.basisCompletion', 'Completion')}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-muted-foreground">{t('detail.resetMode', 'Sub-tasks')}</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        data-testid="detail-reset-reset"
                        onClick={() => { setRecurringResetMode('RESET'); handleChange(); }}
                        className={cn(
                          'rounded-control px-2 py-0.5 text-xs transition-colors',
                          recurringResetMode === 'RESET'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {t('detail.resetModeReset', 'Reset')}
                      </button>
                      <button
                        type="button"
                        data-testid="detail-reset-keep"
                        onClick={() => { setRecurringResetMode('KEEP'); handleChange(); }}
                        className={cn(
                          'rounded-control px-2 py-0.5 text-xs transition-colors',
                          recurringResetMode === 'KEEP'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {t('detail.resetModeKeep', 'Keep')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sub-tasks */}
            <div data-testid="detail-subtasks" className="flex flex-col gap-2 border-b border-border/70 py-2">
              <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('detail.subtasks')}
                {subtasks.length > 0 && ` · ${subtasks.filter(st => st.completedAt).length}/${subtasks.length}`}
              </span>
              {subtasks.map(st => (
                <div
                  key={st.id}
                  data-testid={`subtask-${st.id}`}
                  draggable
                  onDragStart={e => handleSubtaskDragStart(st, e)}
                  onDragOver={e => handleSubtaskDragOver(st, e)}
                  onDragLeave={() => setDragOverSubtaskId(null)}
                  onDrop={e => handleSubtaskDrop(st, e)}
                  onDragEnd={() => { setDraggedSubtaskId(null); setDragOverSubtaskId(null); }}
                  className={cn(
                    'group flex min-h-9 items-center gap-2.5',
                    draggedSubtaskId === st.id && 'opacity-40',
                    dragOverSubtaskId === st.id && 'ring-2 ring-inset ring-primary',
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  <Checkbox
                    data-testid={`subtask-toggle-${st.id}`}
                    checked={!!st.completedAt}
                    onCheckedChange={() => handleToggleSubtask(st)}
                    className="shrink-0"
                  />
                  {editingSubtaskId === st.id ? (
                    <Input
                      data-testid={`subtask-edit-${st.id}`}
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleInlineEditSave(st); }
                        if (e.key === 'Escape') setEditingSubtaskId(null);
                      }}
                      onBlur={() => handleInlineEditSave(st)}
                      autoFocus
                      className="h-7 flex-1 border-border/70 bg-background text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid={`subtask-title-${st.id}`}
                      onClick={() => handleInlineEditStart(st)}
                      onDoubleClick={() => onSelectTask?.(st)}
                      className={cn(
                        'flex-1 min-w-0 truncate text-left text-sm transition-colors',
                        st.completedAt ? 'line-through text-muted-foreground' : 'text-foreground hover:text-primary'
                      )}
                    >
                      {st.title}
                    </button>
                  )}
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      data-testid={`subtask-promote-${st.id}`}
                      onClick={() => handlePromoteSubtask(st)}
                      aria-label={t('detail.promoteSubtask')}
                      title={t('detail.promoteSubtask')}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CornerUpLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      data-testid={`subtask-demote-${st.id}`}
                      onClick={() => handleDemoteSubtask(st)}
                      aria-label={t('detail.demoteSubtask')}
                      title={t('detail.demoteSubtask')}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CornerDownRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      data-testid={`subtask-delete-${st.id}`}
                      onClick={() => handleDeleteSubtask(st)}
                      aria-label={t('detail.deleteSubtask')}
                      title={t('detail.deleteSubtask')}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {!task.parentId && (
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  data-testid="subtask-input"
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                  placeholder={t('detail.addSubtask')}
                  disabled={addingSubtask}
                    className="h-9 flex-1 border-border/70 bg-background text-sm"
                />
              </div>
              )}
            </div>

            {/* Checklist */}
            <div className="flex flex-col gap-2 border-b border-border/70 py-2">
              <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('detail.checklist')}
                {checklistItems.length > 0 && ` · ${checklistItems.filter(ci => ci.completedAt).length}/${checklistItems.length}`}
              </span>
              {checklistItems.map(ci => (
                <div
                  key={ci.id}
                  draggable
                  onDragStart={e => handleChecklistDragStart(ci, e)}
                  onDragOver={e => handleChecklistDragOver(ci, e)}
                  onDrop={e => handleChecklistDrop(ci, e)}
                  className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50"
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Checkbox
                    checked={!!ci.completedAt}
                    onCheckedChange={() => handleToggleChecklistItem(ci)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className={cn('flex-1 text-sm', ci.completedAt && 'line-through text-muted-foreground')}>
                    {ci.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteChecklistItem(ci.id)}
                    aria-label={t('detail.deleteChecklistItem')}
                    title={t('detail.deleteChecklistItem')}
                    className="shrink-0 rounded-control p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  data-testid="checklist-input"
                  value={newChecklistItem}
                  onChange={e => setNewChecklistItem(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChecklistItem();
                    }
                  }}
                  placeholder={t('detail.addChecklistItem')}
                  disabled={addingChecklistItem}
                  className="h-9 flex-1 border-border/70 bg-background text-sm"
                />
              </div>
            </div>

            {/* Reminders — one wrapping row of compact chips instead of a list */}
            <div className="flex flex-col gap-1.5 border-b border-border/70 py-1.5" data-testid="detail-reminders">
              <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('detail.reminders')}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {reminders.map(r => (
                  <div
                    key={r.id}
                    className="group flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 py-1 pl-2 pr-1 text-xs"
                  >
                    <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{formatDateTimeDisplay(new Date(r.remindAt))}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteReminder(r.id)}
                      aria-label={t('detail.deleteReminder')}
                      className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={t('detail.deleteReminder')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {reminders.length === 0 && (
                  <span className="text-xs text-muted-foreground/60">{t('detail.noReminders')}</span>
                )}
                <div className="relative" ref={reminderMenuRef}>
                <button
                  type="button"
                  onClick={() => setReminderMenuOpen(o => !o)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-border/70 px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('detail.addReminder')}
                </button>
                {reminderMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-panel border border-border bg-card shadow-lg py-1">
                    <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => handleAddReminder(5 * 60_000)}>
                      {t('detail.reminder5m')}
                    </button>
                    <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => handleAddReminder(15 * 60_000)}>
                      {t('detail.reminder15m')}
                    </button>
                    <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => handleAddReminder(30 * 60_000)}>
                      {t('detail.reminder30m')}
                    </button>
                    <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => handleAddReminder(60 * 60_000)}>
                      {t('detail.reminder1h')}
                    </button>
                    <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => handleAddReminder(24 * 60 * 60_000)}>
                      {t('detail.reminder1d')}
                    </button>
                    <div className="border-t border-border/50 px-3 py-1.5">
                      <input
                        type="datetime-local"
                        value={customReminderTime}
                        onChange={e => setCustomReminderTime(e.target.value)}
                        className="w-full rounded border border-border/70 bg-background px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomReminder}
                        disabled={!customReminderTime}
                        className="mt-1 w-full rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {t('detail.reminderCustom')}
                      </button>
                    </div>
                  </div>
                )}
                </div>
              </div>
            </div>

            <div className="rounded-panel border border-border">
              <button
                type="button"
                data-testid="pomodoro-toggle"
                onClick={() => setPomodoroOpen(o => !o)}
                aria-expanded={pomodoroOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  {t('pomodoro.title')}
                </span>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', pomodoroOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {pomodoroOpen && (
                <div className="border-t border-border p-1">
                  <PomodoroTimer
                    key={task.id}
                    taskId={task.id}
                    initialCount={task.pomodoroCount}
                    onComplete={onCompletePomodoro}
                    workDurationMinutes={pomodoroWorkMinutes}
                    breakDurationMinutes={pomodoroBreakMinutes}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          {featureFlags.taskDetailV2 && autosave.state !== 'idle' && (
            <div
              aria-live="polite"
              className="mx-4 mb-2 flex min-h-7 items-center justify-between rounded-control bg-muted/60 px-2.5 text-[11px] text-muted-foreground"
              data-testid="detail-autosave-status"
            >
              <span>
                {autosave.state === 'waiting' && 'Waiting to save…'}
                {autosave.state === 'saving' && 'Saving…'}
                {autosave.state === 'saved' && 'Saved'}
                {autosave.state === 'queued' && 'Saved offline — queued to sync'}
                {autosave.state === 'error' && (autosave.error || 'Unable to save')}
              </span>
              {autosave.canUndo && (
                <button
                  type="button"
                  onClick={() => void autosave.undo()}
                  className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Undo
                </button>
              )}
            </div>
          )}
          {error && (
            <div role="alert" className="mx-4 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card/95 px-4 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="detail-complete-parent"
              onClick={() => {
                if (!task.completedAt && hasIncompleteSubtasks) {
                  setShowCompleteConfirm(true);
                } else {
                  handleCompleteParent();
                }
              }}
              className="gap-1.5 text-xs"
            >
              {task.completedAt ? t('detail.reopen') : t('detail.complete')}
            </Button>
            <Button
              type="submit"
              size="sm"
              data-testid="detail-save"
              disabled={saving || !title.trim()}
              className={cn(
                "gap-1.5 px-4 transition-transform duration-150",
                isDirty && !saving && "ring-2 ring-primary shadow-sm shadow-primary/10"
              )}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? '...' : t('detail.save')}
            </Button>
          </div>
        </form>
      </div>

      {/* Discard confirm dialog */}
      {showDiscardConfirm && (
        <div
          className="frosted-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setShowDiscardConfirm(false)}
        >
          <div
            ref={discardConfirmDialogRef}
            className="frosted-surface bg-card rounded-xl border border-border p-6 w-[90vw] max-w-sm shadow-lg"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-confirm-title"
            aria-describedby="discard-confirm-description"
          >
            <h3 id="discard-confirm-title" className="font-semibold text-base mb-2">{t('detail.discardChanges')}</h3>
            <p id="discard-confirm-description" className="text-sm text-muted-foreground mb-4">
              {t('detail.discardMessage')}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDiscardConfirm(false)}>
                {t('detail.keepEditing')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid="detail-discard-confirm"
                onClick={() => { setShowDiscardConfirm(false); onClose(); }}
              >
                {t('detail.discard')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <div
          className="frosted-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            ref={deleteConfirmDialogRef}
            className="frosted-surface bg-card rounded-xl border border-border p-6 w-[90vw] max-w-sm shadow-lg"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-description"
          >
            <h3 id="delete-confirm-title" className="font-semibold text-base mb-2">{t('detail.delete')}</h3>
            <p id="delete-confirm-description" className="text-sm text-muted-foreground mb-4">
              {t('detail.deleteTaskMessage')}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                {t('detail.cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid="detail-delete-confirm"
                onClick={() => { onDelete(task.id); setShowDeleteConfirm(false); }}
              >
                {t('detail.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete parent with incomplete subtasks confirm */}
      {showCompleteConfirm && (
        <div
          className="frosted-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setShowCompleteConfirm(false)}
        >
          <div
            ref={completeConfirmDialogRef}
            className="frosted-surface bg-card rounded-xl border border-border p-6 w-[90vw] max-w-sm shadow-lg"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="complete-confirm-title"
            aria-describedby="complete-confirm-desc"
          >
            <h3 id="complete-confirm-title" className="font-semibold text-base mb-2">{t('detail.complete')}</h3>
            <p id="complete-confirm-desc" className="text-sm text-muted-foreground mb-4">
              {t('detail.completeWithIncompleteSubtasks', { count: subtasks.filter(st => !st.completedAt).length })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowCompleteConfirm(false)}>
                {t('detail.keepEditing')}
              </Button>
              <Button
                size="sm"
                data-testid="detail-complete-confirm"
                onClick={handleCompleteParent}
              >
                {t('detail.complete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
