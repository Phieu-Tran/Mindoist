export interface ParseOpts {
  locale: 'en' | 'vi';
  now: Date;
}

export interface ParsedQuickAdd {
  title: string;
  dueDate?: string;   // YYYY-MM-DD
  dueTime?: string;   // HH:mm
  priority?: number;  // 1–4
  durationMin?: number;
  projectId?: string;
  reminderOffsetMin?: number; // minutes before dueDate/dueTime the reminder fires
}

// ---------------------------------------------------------------------------
// Priority extraction (same for EN + VI)
// ---------------------------------------------------------------------------

const PRIORITY_RE = /\bp([1-4])\b/i;
const DURATION_RE_EN = /\b(\d+)\s*(?:h(?:\s*(\d+)\s*m(?:in)?)?|m(?:in(?:ute)?)?|p)\b/i;
const DURATION_RE_VI = /\b(\d+)\s*(?:h\s*(\d+)\s*m(?:in)?|m(?:in(?:ute)?)?|p)\b/i;
const PROJECT_RE = /(?:^|\s)#(\w+)/;
// "remind [me] 15m before" / "remind 1h before" — matched and stripped BEFORE
// the generic duration regex runs, so "15m" here isn't also picked up as the
// task's own durationMin.
const REMINDER_RE_EN = /\bremind(?:\s+me)?\s+(\d+)\s*(hour|hr|h|minute|min|m)s?\s+before\b/i;
// "nhắc [tôi] trước 15 phút" / "nhắc trước 1 giờ" — the multi-letter Vietnamese
// units (giờ/phút) end in a diacritic that JS regex's \b treats as a
// non-word character, so a trailing \b right after the whole alternation
// never matches (\W next to \W isn't a boundary); only the bare single-letter
// latin fallbacks (h/p) need their own \b to avoid matching mid-word.
const REMINDER_RE_VI = /\bnhắc(?:\s+tôi)?\s+trước\s+(\d+)\s*(giờ|gio|phút|phut|h\b|p\b)/i;

function reminderUnitToMinutes(qty: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('h') || u === 'giờ' || u === 'gio') return qty * 60;
  return qty;
}

function extractReminderOffset(raw: string, regex: RegExp): { reminderOffsetMin?: number; cleaned: string } {
  const m = raw.match(regex);
  if (!m) return { cleaned: raw };
  const mins = reminderUnitToMinutes(Number(m[1]), m[2]);
  return { reminderOffsetMin: mins > 0 ? mins : undefined, cleaned: raw.replace(regex, '').trim() };
}

function extractPriority(raw: string): { priority?: number; cleaned: string } {
  const m = raw.match(PRIORITY_RE);
  if (!m) return { cleaned: raw };
  return { priority: Number(m[1]), cleaned: raw.replace(PRIORITY_RE, '').trim() };
}

function extractDuration(raw: string, regex: RegExp): { durationMin?: number; cleaned: string } {
  const m = raw.match(regex);
  if (!m) return { cleaned: raw };
  let mins = 0;
  if (m[2]) {
    mins = Number(m[1]) * 60 + Number(m[2]);
  } else if (m[0].toLowerCase().includes('h')) {
    mins = Number(m[1]) * 60;
  } else {
    mins = Number(m[1]);
  }
  return { durationMin: mins > 0 ? mins : undefined, cleaned: raw.replace(regex, '').trim() };
}

// ---------------------------------------------------------------------------
// EN parser — chrono-node
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as chrono from 'chrono-node';

function parseEn(input: string, now: Date): ParsedQuickAdd {
  const { reminderOffsetMin, cleaned: c0 } = extractReminderOffset(input, REMINDER_RE_EN);
  const { priority, cleaned: c1 } = extractPriority(c0);
  const { durationMin, cleaned: c2 } = extractDuration(c1, DURATION_RE_EN);
  const projectMatch = c2.match(PROJECT_RE);
  const projectId = projectMatch?.[1];
  const cleaned = projectMatch ? c2.replace(PROJECT_RE, ' ').trim() : c2;

  const results = chrono.parse(cleaned, now);
  const first = results[0];

  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let title = cleaned;

  if (first) {
    const ref = first.start;
    const hasTime = ref.get('hour') !== undefined || ref.get('minute') !== undefined;
    const y = ref.get('year') ?? new Date().getFullYear();
    const M = ref.get('month') ?? new Date().getMonth() + 1;
    const d = ref.get('day') ?? new Date().getDate();
    dueDate = `${y}-${pad(M)}-${pad(d)}`;
    if (hasTime) {
      const h = ref.get('hour') ?? 0;
      const m = ref.get('minute') ?? 0;
      dueTime = `${pad(h)}:${pad(m)}`;
    }
    const textBefore = cleaned.slice(0, first.index);
    const textAfter = cleaned.slice(first.index + first.text.length);
    title = `${textBefore} ${textAfter}`.trim();
  }

  title = cleanTitle(title);
  const result: ParsedQuickAdd = { title };
  if (dueDate) result.dueDate = dueDate;
  if (dueTime) result.dueTime = dueTime;
  if (priority) result.priority = priority;
  if (durationMin) result.durationMin = durationMin;
  if (projectId) result.projectId = projectId;
  if (reminderOffsetMin) result.reminderOffsetMin = reminderOffsetMin;
  return result;
}

// ---------------------------------------------------------------------------
// VI parser — rule-based
// ---------------------------------------------------------------------------

function viMatchTime(input: string): { start: number; end: number; time: string } | undefined {
  const text = input.toLowerCase();

  // HH:MM (24h)
  const hm = text.match(/(\d{1,2}):(\d{2})\b/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { start: hm.index!, end: hm.index! + hm[0].length, time: pad(h) + ':' + pad(m) };
    }
  }

  // HH giờ [MM] or HHh[MM] or HHg[MM] or HHgMM (e.g., 9h30)
  const hourVi = text.match(/(\d{1,2})\s*(?:giờ|g|h)\s*(?:(\d{1,2})\s*(?:phút|p|m)?)?/);
  if (hourVi) {
    const h = Number(hourVi[1]);
    const m = hourVi[2] ? Number(hourVi[2]) : 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { start: hourVi.index!, end: hourVi.index! + hourVi[0].length, time: pad(h) + ':' + pad(m) };
    }
  }

  return undefined;
}

function viMatchDate(input: string, now: Date): { start: number; end: number; date: string } | undefined {
  const text = input.toLowerCase();

  // dd/mm[/yyyy]
  const dmy = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = dmy[3] ? resolveYear(Number(dmy[3]), now) : now.getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        start: dmy.index!,
        end: dmy.index! + dmy[0].length,
        date: `${year}-${pad(month)}-${pad(day)}`,
      };
    }
  }

  // "tuần sau"
  if (/\btuần sau\b/.test(text)) {
    const d = addDays(now, 7);
    const match = text.match(/tuần sau/)!;
    return { start: match.index!, end: match.index! + match[0].length, date: fmtDate(d) };
  }

  // "tuần này"
  if (/\btuần này\b/.test(text)) {
    const dayOfWeek = now.getDay();
    const target = dayOfWeek <= 5 ? now : addDays(now, 7 - dayOfWeek + 5);
    const match = text.match(/tuần này/)!;
    return { start: match.index!, end: match.index! + match[0].length, date: fmtDate(target) };
  }

  // "chủ nhật" / "CN"
  const sunMatch = text.match(/\b(?:chủ nhật|cn)\b/);
  if (sunMatch) {
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    const d = addDays(now, diff);
    return { start: sunMatch.index!, end: sunMatch.index! + sunMatch[0].length, date: fmtDate(d) };
  }

  // "thứ X" / "tX" (Mon=1..Sun=7 in Vietnamese week)
  const thuMatch = text.match(/\b(?:thứ\s*(\d)|t(\d))\b/);
  if (thuMatch) {
    const targetDay = Number(thuMatch[1] || thuMatch[2]);
    const dayOfWeek = now.getDay(); // 0=Sun,1=Mon..6=Sat
    // Map JS getDay (Sun=0..Sat=6) → Vietnamese (thứ 2=Mon..thứ 7=Sat)
    const currentAsVi = (dayOfWeek + 6) % 7 + 2;
    let diff = targetDay - currentAsVi;
    if (diff <= 0) diff += 7;
    const d = addDays(now, diff);
    return { start: thuMatch.index!, end: thuMatch.index! + thuMatch[0].length, date: fmtDate(d) };
  }

  // "ngày mai" / "mai"
  const tomorrowMatch = text.match(/\b(?:ngày mai|mai)\b/);
  if (tomorrowMatch) {
    const d = addDays(now, 1);
    return { start: tomorrowMatch.index!, end: tomorrowMatch.index! + tomorrowMatch[0].length, date: fmtDate(d) };
  }

  // "ngày kia"
  const dayAfterMatch = text.match(/\b(?:ngày kia)\b/);
  if (dayAfterMatch) {
    const d = addDays(now, 2);
    return { start: dayAfterMatch.index!, end: dayAfterMatch.index! + dayAfterMatch[0].length, date: fmtDate(d) };
  }

  // "hôm nay" / "nay"
  const todayMatch = text.match(/\b(?:hôm nay|nay)\b/);
  if (todayMatch) {
    return { start: todayMatch.index!, end: todayMatch.index! + todayMatch[0].length, date: fmtDate(now) };
  }

  return undefined;
}

function parseVi(input: string, now: Date): ParsedQuickAdd {
  const { reminderOffsetMin, cleaned: c0 } = extractReminderOffset(input, REMINDER_RE_VI);
  const { priority, cleaned: c1 } = extractPriority(c0);
  const { durationMin, cleaned: c2 } = extractDuration(c1, DURATION_RE_VI);
  const projectMatch = c2.match(PROJECT_RE);
  const projectId = projectMatch?.[1];
  const cleaned = projectMatch ? c2.replace(PROJECT_RE, ' ').trim() : c2;

  const dateMatch = viMatchDate(cleaned, now);
  const timeMatch = viMatchTime(cleaned);

  let title = cleaned;
  const matchedRanges: Array<{ start: number; end: number }> = [];
  if (dateMatch) matchedRanges.push(dateMatch);
  if (timeMatch) matchedRanges.push(timeMatch);

  matchedRanges.sort((a, b) => b.start - a.start);
  for (const range of matchedRanges) {
    title = (title.slice(0, range.start) + ' ' + title.slice(range.end)).trim();
  }

  title = cleanTitle(title);
  const result: ParsedQuickAdd = { title };
  if (dateMatch) result.dueDate = dateMatch.date;
  if (timeMatch) result.dueTime = timeMatch.time;
  if (priority) result.priority = priority;
  if (durationMin) result.durationMin = durationMin;
  if (projectId) result.projectId = projectId;
  if (reminderOffsetMin) result.reminderOffsetMin = reminderOffsetMin;
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseQuickAdd(input: string, opts: ParseOpts): ParsedQuickAdd {
  if (opts.locale === 'en') return parseEn(input, opts.now);
  return parseVi(input, opts.now);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function resolveYear(y: number, now: Date): number {
  if (y < 100) y += 2000;
  return y;
}

function cleanTitle(s: string): string {
  return s.replace(/\s{2,}/g, ' ').trim();
}
