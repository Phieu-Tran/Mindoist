import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { X, Repeat, ArrowLeft, Trash2, Save, ChevronDown, Timer, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useDialogA11y } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Task, UpdateTaskRequest, Tag as TagType } from '@mindoist/shared/types';
import { buildRrule } from '@mindoist/shared/recurrence/utils';
import type { RecurrencePreset } from '@mindoist/shared/recurrence/utils';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { DueCountdown } from '@/components/DueCountdown';
import { useTaskAutosave } from '@/features/tasks/detail/use-task-autosave';
import { useTaskRelated } from '@/features/tasks/detail/use-task-related';
import { TaskRemindersSection } from '@/features/tasks/detail/TaskRemindersSection';
import { TaskRelatedSections } from '@/features/tasks/detail/TaskRelatedSections';
import { TaskPropertyEditor } from '@/features/tasks/detail/TaskPropertyEditor';
import type { TaskPropertyDraft } from '@/features/tasks/detail/properties/types';
import { useTaskInspectorState } from './use-task-inspector-state';

export interface TaskInspectorProps {
  task: Task;
  projects: { id: string; name: string; color?: string | null }[];
  tags: TagType[];
  onCreateTag?: (name: string) => Promise<TagType>;
  onDeleteTag?: (id: string) => Promise<void>;
  onSave: (id: string, req: UpdateTaskRequest) => Promise<void> | void;
  onAutosave?: (id: string, req: UpdateTaskRequest) => Promise<void> | void;
  onCompletePomodoro: (id: string) => Promise<Task>;
  onToggleComplete?: (task: Task) => Promise<void> | void;
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

function authHeaders(): Record<string, string> | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function TaskInspector({
  task, projects, tags, onCreateTag, onDeleteTag, onSave, onAutosave, onCompletePomodoro, onClose, onDelete, onDeleteWithUndo,
  onToggleComplete, onSelectTask, onTasksChanged, onColorPreview, rail = false,
  pomodoroWorkMinutes, pomodoroBreakMinutes,
}: TaskInspectorProps) {
  const { t } = useTranslation('tasks');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const {
    title, setTitle, description, setDescription, color, setColor, dueDate, setDueDate,
    dueTime, setDueTime, startDate, setStartDate, priority, setPriority, projectId, setProjectId,
    tagIds, setTagIds, dirty, setDirty, saving, setSaving, error, setError,
    pomodoroOpen, setPomodoroOpen, taskMenuOpen, setTaskMenuOpen,
    showDeleteConfirm, setShowDeleteConfirm, showDiscardConfirm, setShowDiscardConfirm,
    showCompleteConfirm, setShowCompleteConfirm, newSubtask, setNewSubtask,
    addingSubtask, setAddingSubtask, editingSubtaskId, setEditingSubtaskId,
    editingTitle, setEditingTitle, draggedSubtaskId, setDraggedSubtaskId,
    dragOverSubtaskId, setDragOverSubtaskId, newChecklistItem, setNewChecklistItem,
    addingChecklistItem, setAddingChecklistItem, reminderMenuOpen, setReminderMenuOpen,
    customReminderTime, setCustomReminderTime, estimateMin, setEstimateMin,
    recurrencePreset, setRecurrencePreset, customRrule, setCustomRrule,
    recurrenceBasis, setRecurrenceBasis, recurringResetMode, setRecurringResetMode,
    resetInspectorState,
  } = useTaskInspectorState(task);
  const isDueOverdue = useMemo(() => {
    if (!dueDate || task.completedAt) return false;
    const target = new Date(`${dueDate}T${dueTime || '23:59'}:00`).getTime();
    return !Number.isNaN(target) && target < Date.now();
  }, [dueDate, dueTime, task.completedAt]);
  // A late initial GET must not overwrite a completion the user just made.
  // This occurred most often immediately after opening the inspector, when
  // the subtask request and a checkbox mutation crossed in flight.
  const subtaskMutationVersion = useRef(0);
  const formId = `task-detail-form-${task.id}`;
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
  const reminderMenuRef = useRef<HTMLDivElement>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const { subtasks, checklistItems, reminders, setSubtasks, setChecklistItems, setReminders } = useTaskRelated(task.id);

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
    if (remindAt.getTime() <= Date.now()) {
      setError(t('detail.reminderPast'));
      setReminderMenuOpen(false);
      return;
    }
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
    if (remindAt.getTime() <= Date.now()) {
      setError(t('detail.reminderPast'));
      setReminderMenuOpen(false);
      return;
    }
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
    if (onToggleComplete) {
      onClose();
      void Promise.resolve(onToggleComplete(task)).catch(() => undefined);
      return;
    }
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
  }, [onClose, onTasksChanged, onToggleComplete, task]);

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
    resetInspectorState(task);
  }, [task.id]);

  // Opening the inspector must not put a caret in the title: the rail is a
  // reading surface first, and stealing focus made every task click look like
  // a rename. Editing starts when the user clicks the field.

  const isDirty = dirty || title !== task.title || description !== (task.description || '') ||
    color !== (task.color || '') ||
    dueDate !== (task.deadline?.date || '') ||
    dueTime !== (task.deadline?.time || '') ||
    startDate !== (task.startDate?.slice(0, 10) || '') ||
    priority !== task.priority || projectId !== (task.projectId || '') ||
    [...tagIds].sort().join(',') !== [...task.tagIds].sort().join(',') ||
    estimateMin !== (task.estimateMin ?? '') ||
    buildRrule(recurrencePreset, customRrule) !== (task.rrule || null) ||
    recurrenceBasis !== (task.recurrenceBasis || 'DUE_DATE') ||
    recurringResetMode !== (task.recurringResetMode || 'RESET');

  const handleChange = useCallback(() => setDirty(true), []);

  const updatePropertyDraft = useCallback(<K extends keyof TaskPropertyDraft>(key: K, value: TaskPropertyDraft[K]) => {
    switch (key) {
      case 'color': setColor(value as string); break;
      case 'deadlineDate': setDueDate(value as string); break;
      case 'deadlineTime': setDueTime(value as string); break;
      case 'startDate': setStartDate(value as string); break;
      case 'priority': setPriority(value as number | null); break;
      case 'projectId': setProjectId(value as string); break;
      case 'tagIds': setTagIds(value as string[]); break;
      case 'estimateMin': setEstimateMin(value as number | ''); break;
      case 'recurrencePreset': setRecurrencePreset(value as RecurrencePreset); break;
      case 'customRrule': setCustomRrule(value as string); break;
      case 'recurrenceBasis': setRecurrenceBasis(value as 'DUE_DATE' | 'COMPLETION_DATE'); break;
      case 'recurringResetMode': setRecurringResetMode(value as 'RESET' | 'KEEP'); break;
    }
  }, []);

  const taskDraft = useMemo<UpdateTaskRequest>(() => ({
    title: title.trim(),
    description: description.trim() || undefined,
    color: color || null,
    deadline: dueDate
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
      : null,
    startDate: startDate || null,
    priority,
    projectId: projectId || null,
    tagIds,
    estimateMin: estimateMin !== '' ? Number(estimateMin) : null,
    // Keep the legacy field in the write payload until all clients have
    rrule: buildRrule(recurrencePreset, customRrule) || null,
    recurrenceBasis,
    recurringResetMode,
  }), [
    color,
    customRrule,
    description,
    dueDate,
    dueTime,
    estimateMin,
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
  const saveProperty = saveDraft;
  const autosave = useTaskAutosave({
    enabled: true,
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
          "focus-silent flex flex-col overflow-hidden border-l border-border/60 bg-card",
          "w-full md:w-[29rem] md:shrink-0",
          "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-[70] max-xl:shadow-2xl",
          "max-md:inset-0",
          rail && "h-full min-h-0 border-l-0 md:w-full md:shrink"
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
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
        <form id={formId} onSubmit={handleSubmit} className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
          <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 pt-1">
            {/* Title */}
            <div className="rounded-xl bg-muted/25 p-3">
            <div className="flex items-start gap-2">
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
                  'focus-soft max-h-[4.5rem] min-h-6 flex-1 resize-none overflow-y-auto rounded-control border border-transparent bg-transparent px-1.5 -mx-1.5 text-base font-semibold leading-6 [field-sizing:content] transition-[box-shadow,background-color] duration-150 focus-visible:bg-background',
                  task.completedAt && 'text-muted-foreground line-through',
                )}
              />
            </div>

            {/* Description — right under the title (D4), auto-growing so it
                reads as the primary writing surface, not an afterthought. */}
            <div className="mt-2 pl-6">
              <textarea
                data-testid="detail-description"
                value={description}
                onChange={e => { setDescription(e.target.value); handleChange(); }}
                placeholder={t('detail.descriptionPlaceholder')}
                rows={2}
                className="focus-soft min-h-12 max-h-40 w-full resize-y rounded-control border border-transparent bg-transparent px-2.5 py-2 text-sm [field-sizing:content] transition-[box-shadow,background-color] duration-150 placeholder:text-muted-foreground/60 focus-visible:bg-background"
              />
            </div>
            </div>

            <TaskPropertyEditor
              taskId={task.id}
              completedAt={task.completedAt}
              deadlineTimeZone={task.deadline?.timeZone}
              draft={{
                color,
                deadlineDate: dueDate,
                deadlineTime: dueTime,
                startDate,
                priority,
                projectId,
                tagIds,
                estimateMin,
                recurrencePreset,
                customRrule,
                recurrenceBasis,
                recurringResetMode,
              }}
              projects={projects}
              tags={tags}
              onCreateTag={onCreateTag}
              onDeleteTag={onDeleteTag}
              save={saveProperty}
              onDraftChange={updatePropertyDraft}
              onTasksChanged={onTasksChanged}
              onColorPreview={onColorPreview}
            />
            {dueDate && !isDueOverdue && (
              <DueCountdown
                dueDate={dueDate}
                dueTime={dueTime || null}
                completedAt={task.completedAt}
                testId="detail-due-countdown"
              />
            )}

            <TaskRelatedSections
                task={task}
                subtasks={subtasks}
                checklistItems={checklistItems}
                newSubtask={newSubtask}
                addingSubtask={addingSubtask}
                editingSubtaskId={editingSubtaskId}
                editingTitle={editingTitle}
                draggedSubtaskId={draggedSubtaskId}
                dragOverSubtaskId={dragOverSubtaskId}
                newChecklistItem={newChecklistItem}
                addingChecklistItem={addingChecklistItem}
                onSelectTask={onSelectTask}
                onNewSubtaskChange={setNewSubtask}
                onAddSubtask={handleAddSubtask}
                onToggleSubtask={handleToggleSubtask}
                onEditSubtask={handleInlineEditStart}
                onSaveSubtask={handleInlineEditSave}
                onPromoteSubtask={handlePromoteSubtask}
                onDemoteSubtask={handleDemoteSubtask}
                onDeleteSubtask={handleDeleteSubtask}
                onSubtaskDragStart={handleSubtaskDragStart}
                onSubtaskDragOver={handleSubtaskDragOver}
                onSubtaskDrop={handleSubtaskDrop}
                onDragLeave={() => setDragOverSubtaskId(null)}
                onDragEnd={() => { setDraggedSubtaskId(null); setDragOverSubtaskId(null); }}
                onEditingTitleChange={setEditingTitle}
                onEditingCancel={() => setEditingSubtaskId(null)}
                onNewChecklistChange={setNewChecklistItem}
                onAddChecklist={handleAddChecklistItem}
                onToggleChecklist={handleToggleChecklistItem}
                onDeleteChecklist={handleDeleteChecklistItem}
                onChecklistDragStart={handleChecklistDragStart}
                onChecklistDragOver={handleChecklistDragOver}
                onChecklistDrop={handleChecklistDrop}
             />

            <TaskRemindersSection
              reminders={reminders}
              reminderMenuOpen={reminderMenuOpen}
              customReminderTime={customReminderTime}
              reminderMenuRef={reminderMenuRef}
              onDelete={handleDeleteReminder}
              onToggleMenu={() => setReminderMenuOpen(open => !open)}
              onAdd={handleAddReminder}
              onCustomTimeChange={setCustomReminderTime}
              onAddCustom={handleAddCustomReminder}
            />

            <div className="rounded-xl bg-muted/25">
              <button
                type="button"
                data-testid="pomodoro-toggle"
                onClick={() => setPomodoroOpen(o => !o)}
                aria-expanded={pomodoroOpen}
                className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  {t('pomodoro.title')}
                </span>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', pomodoroOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {pomodoroOpen && (
                <div className="px-1 pb-1">
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
          {autosave.state !== 'idle' && (
            <div
              aria-live="polite"
              className="mx-4 mb-2 flex min-h-7 items-center justify-between rounded-control bg-muted/60 px-2.5 text-[11px] text-muted-foreground"
              data-testid="detail-sync-status"
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
          <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-card/95 px-4 py-2.5 backdrop-blur-sm">
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
              {saving ? '…' : t('detail.save')}
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
