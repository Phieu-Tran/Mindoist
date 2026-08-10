import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@mindoist/shared/types';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

export const DEFAULT_WORK_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;

type TimerPhase = 'work' | 'break';
type TimerStatus = 'idle' | 'running' | 'paused';

interface TimerSnapshot {
  phase: TimerPhase;
  status: TimerStatus;
  remainingSeconds: number;
  endTime: number | null;
  workSeconds: number;
  breakSeconds: number;
}

interface Props {
  taskId: string;
  initialCount: number;
  onComplete: (taskId: string) => Promise<Task>;
  workDurationMinutes?: number;
  breakDurationMinutes?: number;
}

const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const pomodoroStorageKey = (taskId: string) => `mindoist:pomodoro:${taskId}`;

function toSeconds(minutes: number) {
  return Math.max(1, Math.round(minutes)) * 60;
}

function defaultSnapshot(workMin: number, breakMin: number): TimerSnapshot {
  return {
    phase: 'work',
    status: 'idle',
    remainingSeconds: toSeconds(workMin),
    endTime: null,
    workSeconds: toSeconds(workMin),
    breakSeconds: toSeconds(breakMin),
  };
}

function readSnapshot(taskId: string, workMin: number, breakMin: number): TimerSnapshot {
  if (typeof window === 'undefined') return defaultSnapshot(workMin, breakMin);

  try {
    const raw = window.localStorage.getItem(pomodoroStorageKey(taskId));
    if (!raw) return defaultSnapshot(workMin, breakMin);

    const value = JSON.parse(raw) as Partial<TimerSnapshot>;
    const phase = value.phase === 'break' ? 'break' : 'work';
    const workSeconds = toSeconds(workMin);
    const breakSeconds = toSeconds(breakMin);
    const duration = phase === 'work' ? workSeconds : breakSeconds;
    const status: TimerStatus = value.status === 'running' || value.status === 'paused'
      ? value.status
      : 'idle';
    const storedRemaining = Number.isFinite(value.remainingSeconds)
      ? Math.max(0, Math.min(duration, Math.round(value.remainingSeconds!)))
      : duration;

    if (status === 'running' && typeof value.endTime === 'number') {
      return {
        phase,
        status,
        remainingSeconds: Math.max(0, Math.ceil((value.endTime - Date.now()) / 1000)),
        endTime: value.endTime,
        workSeconds,
        breakSeconds,
      };
    }

    return {
      phase,
      status: status === 'running' ? 'paused' : status,
      remainingSeconds: status === 'idle' ? duration : storedRemaining,
      endTime: null,
      workSeconds,
      breakSeconds,
    };
  } catch {
    return defaultSnapshot(workMin, breakMin);
  }
}

function playBeep() {
  if (typeof window === 'undefined') return;

  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch {
    // Audio is an enhancement; a blocked AudioContext must not stop the timer.
  }
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

export function PomodoroTimer({
  taskId, initialCount, onComplete,
  workDurationMinutes = DEFAULT_WORK_MINUTES,
  breakDurationMinutes = DEFAULT_BREAK_MINUTES,
}: Props) {
  const { t } = useTranslation('tasks');
  const workSeconds = toSeconds(workDurationMinutes);
  const breakSeconds = toSeconds(breakDurationMinutes);
  const initialSnapshot = useRef(readSnapshot(taskId, workDurationMinutes, breakDurationMinutes));
  const [phase, setPhase] = useState<TimerPhase>(initialSnapshot.current.phase);
  const [status, setStatus] = useState<TimerStatus>(initialSnapshot.current.status);
  const [remainingSeconds, setRemainingSeconds] = useState(initialSnapshot.current.remainingSeconds);
  const [endTime, setEndTime] = useState<number | null>(initialSnapshot.current.endTime);
  const [sessionCount, setSessionCount] = useState(initialCount);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completionInFlight = useRef(false);

  useEffect(() => setSessionCount(initialCount), [initialCount]);

  useEffect(() => {
    const snapshot: TimerSnapshot = { phase, status, remainingSeconds, endTime, workSeconds, breakSeconds };
    window.localStorage.setItem(pomodoroStorageKey(taskId), JSON.stringify(snapshot));
  }, [taskId, phase, status, remainingSeconds, endTime, workSeconds, breakSeconds]);

  const finishPhase = useCallback(async () => {
    if (completionInFlight.current) return;
    completionInFlight.current = true;
    setCompleting(true);
    setStatus('paused');
    setEndTime(null);
    setError(null);

    try {
      if (phase === 'work') {
        const updatedTask = await onComplete(taskId);
        setSessionCount(updatedTask.pomodoroCount);
        playBeep();
        setPhase('break');
        setRemainingSeconds(breakSeconds);
        setEndTime(Date.now() + breakSeconds * 1000);
        setStatus('running');
      } else {
        playBeep();
        setPhase('work');
        setRemainingSeconds(workSeconds);
        setStatus('idle');
      }
    } catch {
      setRemainingSeconds(1);
      setError(t('pomodoro.error'));
    } finally {
      completionInFlight.current = false;
      setCompleting(false);
    }
  }, [onComplete, phase, taskId, t, workSeconds, breakSeconds]);

  useEffect(() => {
    if (status !== 'running' || endTime === null) return;

    const tick = () => {
      const nextRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);
      if (nextRemaining === 0) void finishPhase();
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [endTime, finishPhase, status]);

  const start = () => {
    if (status === 'running' || completing) return;
    setError(null);
    setEndTime(Date.now() + Math.max(1, remainingSeconds) * 1000);
    setStatus('running');
  };

  const pause = () => {
    if (status !== 'running') return;
    const nextRemaining = endTime === null
      ? remainingSeconds
      : Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    setRemainingSeconds(nextRemaining);
    setEndTime(null);
    setStatus('paused');
  };

  const reset = () => {
    setPhase('work');
    setStatus('idle');
    setRemainingSeconds(workSeconds);
    setEndTime(null);
    setError(null);
  };

  const duration = phase === 'work' ? workSeconds : breakSeconds;
  const ringOffset = RING_CIRCUMFERENCE * (remainingSeconds / duration);
  const phaseLabel = phase === 'work' ? t('pomodoro.workTime') : t('pomodoro.breakTime');
  const statusLabel = status === 'running'
    ? t('pomodoro.running')
    : status === 'paused'
      ? t('pomodoro.paused')
      : phaseLabel;

  return (
    <section
      data-testid="pomodoro-timer"
      data-phase={phase}
      data-status={status}
      className="rounded-xl border border-border bg-muted/30 p-4"
      aria-labelledby={`pomodoro-title-${taskId}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 id={`pomodoro-title-${taskId}`} className="text-sm font-semibold">
            {t('pomodoro.title')}
          </h4>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {t('pomodoro.sessions', { count: sessionCount })}
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="relative grid h-28 w-28 shrink-0 place-items-center" aria-label={phaseLabel}>
          <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
            <circle
              className="fill-none stroke-border"
              cx="50"
              cy="50"
              r={RING_RADIUS}
              strokeWidth="7"
            />
            <circle
              className={cn('fill-none', phase === 'work' ? 'stroke-primary' : 'stroke-muted-foreground')}
              cx="50"
              cy="50"
              r={RING_RADIUS}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <span data-testid="pomodoro-time" className="font-mono text-xl font-semibold tabular-nums">
              {formatTime(remainingSeconds)}
            </span>
            <span role="status" aria-live="polite" className="text-[11px] text-muted-foreground">
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-row gap-2 sm:flex-col">
          {status === 'running' ? (
            <Button type="button" size="sm" variant="outline" onClick={pause} disabled={completing}>
              <Pause className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('pomodoro.pause')}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={start} disabled={completing}>
              <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('pomodoro.start')}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={completing}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('pomodoro.reset')}
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-center text-xs text-destructive">{error}</p>}
    </section>
  );
}
