import { useCallback, useReducer, type Dispatch, type SetStateAction } from 'react';
import type { CalendarTaskSlot } from '@/components/CalendarView';
import type { UndoToastState } from '@/components/UndoToast';

export interface TaskColorPreview {
  id: string;
  color: string;
}

interface WorkspaceUiState {
  calendarDraft: CalendarTaskSlot | null;
  colorPreview: TaskColorPreview | null;
  undoToast: UndoToastState | null;
}

type WorkspaceUiAction = {
  [Key in keyof WorkspaceUiState]: {
    key: Key;
    value: SetStateAction<WorkspaceUiState[Key]>;
  }
}[keyof WorkspaceUiState];

const initialState: WorkspaceUiState = {
  calendarDraft: null,
  colorPreview: null,
  undoToast: null,
};

function resolveState<Value>(current: Value, update: SetStateAction<Value>): Value {
  return typeof update === 'function' ? (update as (value: Value) => Value)(current) : update;
}

function reducer(state: WorkspaceUiState, action: WorkspaceUiAction): WorkspaceUiState {
  if (action.key === 'calendarDraft') return { ...state, calendarDraft: resolveState(state.calendarDraft, action.value) };
  if (action.key === 'colorPreview') return { ...state, colorPreview: resolveState(state.colorPreview, action.value) };
  return { ...state, undoToast: resolveState(state.undoToast, action.value) };
}

/** Small reducer-backed store for transient workspace UI that must stay coherent across route changes. */
export function useWorkspaceUiState() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const setCalendarDraft = useCallback<Dispatch<SetStateAction<CalendarTaskSlot | null>>>(value => dispatch({ key: 'calendarDraft', value }), []);
  const setColorPreview = useCallback<Dispatch<SetStateAction<TaskColorPreview | null>>>(value => dispatch({ key: 'colorPreview', value }), []);
  const setUndoToast = useCallback<Dispatch<SetStateAction<UndoToastState | null>>>(value => dispatch({ key: 'undoToast', value }), []);
  return { ...state, setCalendarDraft, setColorPreview, setUndoToast };
}
