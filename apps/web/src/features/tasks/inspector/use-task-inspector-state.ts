import { useMemo, useReducer, type Dispatch, type SetStateAction } from 'react';
import type { Task } from '@mindoist/shared/types';
import { rruleToPreset, type RecurrencePreset } from '@mindoist/shared/recurrence/utils';

interface DraftState {
  title: string;
  description: string;
  color: string;
  dueDate: string;
  dueTime: string;
  startDate: string;
  priority: number | null;
  projectId: string;
  tagIds: string[];
  estimateMin: number | '';
  recurrencePreset: RecurrencePreset;
  customRrule: string;
  recurrenceBasis: 'DUE_DATE' | 'COMPLETION_DATE';
  recurringResetMode: 'RESET' | 'KEEP';
}

interface UiState {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  pomodoroOpen: boolean;
  taskMenuOpen: boolean;
  showDeleteConfirm: boolean;
  showDiscardConfirm: boolean;
  showCompleteConfirm: boolean;
  newSubtask: string;
  addingSubtask: boolean;
  editingSubtaskId: string | null;
  editingTitle: string;
  draggedSubtaskId: string | null;
  dragOverSubtaskId: string | null;
  newChecklistItem: string;
  addingChecklistItem: boolean;
  reminderMenuOpen: boolean;
  customReminderTime: string;
}

interface DetailState { draft: DraftState; ui: UiState }
type Action = { type: 'reset'; task: Task } | { type: 'draft' | 'ui'; key: string; value: unknown };
type Setter<T> = Dispatch<SetStateAction<T>>;

function stateFromTask(task: Task): DetailState {
  const recurrencePreset = rruleToPreset(task.rrule);
  return {
    draft: {
      title: task.title,
      description: task.description || '',
      color: task.color || '',
      dueDate: task.deadline?.date || '',
      dueTime: task.deadline?.time || '',
      startDate: task.startDate?.slice(0, 10) || '',
      priority: task.priority,
      projectId: task.projectId || '',
      tagIds: task.tagIds,
      estimateMin: task.estimateMin ?? '',
      recurrencePreset,
      customRrule: recurrencePreset === 'custom' ? task.rrule || '' : '',
      recurrenceBasis: task.recurrenceBasis || 'DUE_DATE',
      recurringResetMode: task.recurringResetMode || 'RESET',
    },
    ui: {
      dirty: false,
      saving: false,
      error: null,
      pomodoroOpen: false,
      taskMenuOpen: false,
      showDeleteConfirm: false,
      showDiscardConfirm: false,
      showCompleteConfirm: false,
      newSubtask: '',
      addingSubtask: false,
      editingSubtaskId: null,
      editingTitle: '',
      draggedSubtaskId: null,
      dragOverSubtaskId: null,
      newChecklistItem: '',
      addingChecklistItem: false,
      reminderMenuOpen: false,
      customReminderTime: '',
    },
  };
}

function reducer(state: DetailState, action: Action): DetailState {
  if (action.type === 'reset') return stateFromTask(action.task);
  const group = state[action.type];
  const current = group[action.key as keyof typeof group];
  const value = typeof action.value === 'function'
    ? (action.value as (previous: unknown) => unknown)(current)
    : action.value;
  return { ...state, [action.type]: { ...group, [action.key]: value } };
}

export function useTaskInspectorState(task: Task) {
  const [state, dispatch] = useReducer(reducer, task, stateFromTask);
  const setters = useMemo(() => {
    const draft = <K extends keyof DraftState>(key: K): Setter<DraftState[K]> => value => dispatch({ type: 'draft', key, value });
    const ui = <K extends keyof UiState>(key: K): Setter<UiState[K]> => value => dispatch({ type: 'ui', key, value });
    return {
      setTitle: draft('title'), setDescription: draft('description'), setColor: draft('color'),
      setDueDate: draft('dueDate'), setDueTime: draft('dueTime'), setStartDate: draft('startDate'),
      setPriority: draft('priority'), setProjectId: draft('projectId'), setTagIds: draft('tagIds'),
      setEstimateMin: draft('estimateMin'), setRecurrencePreset: draft('recurrencePreset'),
      setCustomRrule: draft('customRrule'), setRecurrenceBasis: draft('recurrenceBasis'),
      setRecurringResetMode: draft('recurringResetMode'),
      setDirty: ui('dirty'), setSaving: ui('saving'), setError: ui('error'),
      setPomodoroOpen: ui('pomodoroOpen'), setTaskMenuOpen: ui('taskMenuOpen'),
      setShowDeleteConfirm: ui('showDeleteConfirm'), setShowDiscardConfirm: ui('showDiscardConfirm'),
      setShowCompleteConfirm: ui('showCompleteConfirm'), setNewSubtask: ui('newSubtask'),
      setAddingSubtask: ui('addingSubtask'), setEditingSubtaskId: ui('editingSubtaskId'),
      setEditingTitle: ui('editingTitle'), setDraggedSubtaskId: ui('draggedSubtaskId'),
      setDragOverSubtaskId: ui('dragOverSubtaskId'), setNewChecklistItem: ui('newChecklistItem'),
      setAddingChecklistItem: ui('addingChecklistItem'), setReminderMenuOpen: ui('reminderMenuOpen'),
      setCustomReminderTime: ui('customReminderTime'),
      resetInspectorState: (nextTask: Task) => dispatch({ type: 'reset', task: nextTask }),
    };
  }, []);

  return { ...state.draft, ...state.ui, ...setters };
}
