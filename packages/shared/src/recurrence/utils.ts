export type RecurrencePreset = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom' | null;

/**
 * Build an RFC 5545 RRULE string from a preset key. For 'custom', returns
 * the caller-supplied raw RRULE text as-is (trimmed; empty -> null) — the
 * server still validates it with RRule.fromString before persisting.
 * Returns null for 'none' / null.
 */
export function buildRrule(preset: RecurrencePreset, customRrule?: string | null): string | null {
  switch (preset) {
    case 'daily':    return 'FREQ=DAILY';
    case 'weekdays': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly':   return 'FREQ=WEEKLY';
    case 'biweekly': return 'FREQ=WEEKLY;INTERVAL=2';
    case 'monthly':  return 'FREQ=MONTHLY';
    case 'yearly':   return 'FREQ=YEARLY';
    case 'custom':   return customRrule?.trim() || null;
    default:         return null;
  }
}

/**
 * Reverse-map an RRULE string to a preset key (best-effort).
 * Rules that don't match a known preset (e.g. a custom RRULE typed by hand,
 * or one imported from TickTick) map to 'custom' rather than null/none —
 * null would silently drop the task's actual recurrence in the UI.
 */
export function rruleToPreset(rruleStr: string | null): RecurrencePreset {
  if (!rruleStr) return null;
  const map: Record<string, RecurrencePreset> = {
    'FREQ=DAILY': 'daily',
    'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR': 'weekdays',
    'FREQ=WEEKLY': 'weekly',
    'FREQ=WEEKLY;INTERVAL=2': 'biweekly',
    'FREQ=MONTHLY': 'monthly',
    'FREQ=YEARLY': 'yearly',
  };
  return map[rruleStr] ?? 'custom';
}
