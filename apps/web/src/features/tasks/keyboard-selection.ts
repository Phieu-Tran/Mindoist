export function toggleTaskSelection(current: ReadonlySet<string>, taskId: string): Set<string> {
  const next = new Set(current);
  if (next.has(taskId)) next.delete(taskId);
  else next.add(taskId);
  return next;
}

export function extendTaskSelection(
  current: ReadonlySet<string>,
  orderedTaskIds: readonly string[],
  focusedTaskId: string | null,
  direction: 'next' | 'previous',
): { selectedIds: Set<string>; focusedTaskId: string | null } {
  if (orderedTaskIds.length === 0) return { selectedIds: new Set(current), focusedTaskId: null };
  const currentIndex = focusedTaskId ? orderedTaskIds.indexOf(focusedTaskId) : -1;
  const fromIndex = currentIndex < 0 ? 0 : currentIndex;
  const delta = direction === 'next' ? 1 : -1;
  const toIndex = Math.max(0, Math.min(orderedTaskIds.length - 1, fromIndex + delta));
  const selectedIds = new Set(current);
  for (let index = Math.min(fromIndex, toIndex); index <= Math.max(fromIndex, toIndex); index += 1) {
    selectedIds.add(orderedTaskIds[index]);
  }
  return { selectedIds, focusedTaskId: orderedTaskIds[toIndex] };
}
