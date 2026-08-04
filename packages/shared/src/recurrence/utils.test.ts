import { describe, it, expect } from 'vitest';
import { buildRrule, rruleToPreset } from './utils.js';

describe('buildRrule', () => {
  it('builds known presets', () => {
    expect(buildRrule('daily')).toBe('FREQ=DAILY');
    expect(buildRrule('weekdays')).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(buildRrule('weekly')).toBe('FREQ=WEEKLY');
    expect(buildRrule('biweekly')).toBe('FREQ=WEEKLY;INTERVAL=2');
    expect(buildRrule('monthly')).toBe('FREQ=MONTHLY');
    expect(buildRrule('yearly')).toBe('FREQ=YEARLY');
  });

  it('returns null for none/null', () => {
    expect(buildRrule(null)).toBeNull();
  });

  it('returns the trimmed custom RRULE text for "custom"', () => {
    expect(buildRrule('custom', '  FREQ=DAILY;INTERVAL=3  ')).toBe('FREQ=DAILY;INTERVAL=3');
  });

  it('returns null for "custom" with empty/whitespace-only text', () => {
    expect(buildRrule('custom', '')).toBeNull();
    expect(buildRrule('custom', '   ')).toBeNull();
    expect(buildRrule('custom', undefined)).toBeNull();
  });
});

describe('rruleToPreset', () => {
  it('maps known RRULE strings back to their preset', () => {
    expect(rruleToPreset('FREQ=DAILY')).toBe('daily');
    expect(rruleToPreset('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('weekdays');
    expect(rruleToPreset('FREQ=WEEKLY')).toBe('weekly');
    expect(rruleToPreset('FREQ=WEEKLY;INTERVAL=2')).toBe('biweekly');
    expect(rruleToPreset('FREQ=MONTHLY')).toBe('monthly');
    expect(rruleToPreset('FREQ=YEARLY')).toBe('yearly');
  });

  it('returns null for no rrule', () => {
    expect(rruleToPreset(null)).toBeNull();
  });

  it('maps an unrecognized RRULE (e.g. hand-written or TickTick-imported) to "custom" instead of dropping it', () => {
    expect(rruleToPreset('FREQ=DAILY;INTERVAL=3')).toBe('custom');
    expect(rruleToPreset('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('custom');
  });

  it('round-trips a custom rrule through buildRrule', () => {
    const original = 'FREQ=DAILY;INTERVAL=3';
    const preset = rruleToPreset(original);
    expect(buildRrule(preset, original)).toBe(original);
  });
});
