/**
 * Focus timer state machine. Time is derived from timestamps, never from
 * counting ticks, so throttled background tabs and reloads stay accurate.
 *
 * Planned time   = plannedMin (intent, never counted as work)
 * Focused time   = time the timer was actually running
 * Interrupted    = time spent paused
 */
import type { ActiveFocus, FocusKind, FocusSession } from "@/db/schema";

export type StartOptions = {
  id: string;
  taskId: string | null;
  label: string;
  domain: string | null;
  kind: FocusKind;
  plannedMin: number;
  breakMin: number;
};

export function startFocus(o: StartOptions, now: number): ActiveFocus {
  return {
    ...o,
    phase: "focus",
    startedAt: now,
    accumulatedMs: 0,
    runningSince: now,
    pausedSince: null,
    pausedMs: 0,
    distractions: [],
    reachedTarget: false,
    endedAt: null,
    breakEndsAt: null,
  };
}

export const plannedMs = (a: ActiveFocus) => a.plannedMin * 60_000;

export function focusedMs(a: ActiveFocus, now: number): number {
  const live = a.runningSince != null ? now - a.runningSince : 0;
  return Math.min(plannedMs(a), a.accumulatedMs + Math.max(0, live));
}

export function pausedTotalMs(a: ActiveFocus, now: number): number {
  return a.pausedMs + (a.pausedSince != null ? Math.max(0, now - a.pausedSince) : 0);
}

export function remainingMs(a: ActiveFocus, now: number): number {
  if (a.phase === "break") return Math.max(0, (a.breakEndsAt ?? now) - now);
  return Math.max(0, plannedMs(a) - focusedMs(a, now));
}

export function progress(a: ActiveFocus, now: number): number {
  if (a.phase === "break") {
    const total = a.breakMin * 60_000;
    return total > 0 ? 1 - remainingMs(a, now) / total : 1;
  }
  return Math.min(1, focusedMs(a, now) / plannedMs(a));
}

export function isRunning(a: ActiveFocus) {
  return a.phase === "focus" && a.runningSince != null;
}

export function pause(a: ActiveFocus, now: number): ActiveFocus {
  if (a.phase !== "focus" || a.runningSince == null) return a;
  return { ...a, accumulatedMs: focusedMs(a, now), runningSince: null, pausedSince: now };
}

export function resume(a: ActiveFocus, now: number): ActiveFocus {
  if (a.phase !== "focus" || a.runningSince != null) return a;
  return { ...a, pausedMs: pausedTotalMs(a, now), pausedSince: null, runningSince: now };
}

/** Advances the machine; returns the same object when nothing changed. */
export function tick(a: ActiveFocus, now: number): ActiveFocus {
  if (a.phase === "focus" && a.runningSince != null && focusedMs(a, now) >= plannedMs(a)) {
    const finishAt = a.runningSince + (plannedMs(a) - a.accumulatedMs);
    return { ...a, accumulatedMs: plannedMs(a), runningSince: null, phase: "review", reachedTarget: true, endedAt: finishAt };
  }
  return a;
}

/** Stop early and move to review. Focused time so far is preserved. */
export function finishEarly(a: ActiveFocus, now: number): ActiveFocus {
  if (a.phase !== "focus") return a;
  return {
    ...a,
    accumulatedMs: focusedMs(a, now),
    pausedMs: pausedTotalMs(a, now),
    runningSince: null,
    pausedSince: null,
    phase: "review",
    reachedTarget: focusedMs(a, now) >= plannedMs(a),
    endedAt: now,
  };
}

/** Continue past the planned time (e.g. "10 more minutes"). */
export function extend(a: ActiveFocus, minutes: number, now: number): ActiveFocus {
  if (a.phase !== "review") return a;
  return { ...a, plannedMin: Math.min(600, a.plannedMin + minutes), phase: "focus", runningSince: now, reachedTarget: false, endedAt: null };
}

export function logDistraction(a: ActiveFocus, note: string, now: number): ActiveFocus {
  return { ...a, distractions: [...a.distractions, { at: now, note: note.trim().slice(0, 200) }] };
}

export function startBreak(a: Pick<ActiveFocus, "id" | "breakMin" | "label">, now: number, newId: string): ActiveFocus {
  return {
    id: newId,
    phase: "break",
    taskId: null,
    label: a.label,
    domain: null,
    kind: "pomodoro",
    plannedMin: Math.max(1, a.breakMin),
    breakMin: a.breakMin,
    startedAt: now,
    accumulatedMs: 0,
    runningSince: null,
    pausedSince: null,
    pausedMs: 0,
    distractions: [],
    reachedTarget: false,
    endedAt: null,
    breakEndsAt: now + a.breakMin * 60_000,
  };
}

/** Minimum focused time before a session can be saved. Shorter attempts can only be discarded. */
export const MIN_SAVE_MS = 60_000;

export function toSession(a: ActiveFocus, date: string, notes: string, quality: number | null): FocusSession {
  const end = a.endedAt ?? Date.now();
  return {
    id: a.id,
    date,
    taskId: a.taskId,
    label: a.label,
    domain: a.domain,
    kind: a.kind,
    plannedMin: a.plannedMin,
    actualSec: Math.round(a.accumulatedMs / 1000),
    pausedSec: Math.round(pausedTotalMs(a, end) / 1000),
    outcome: a.reachedTarget ? "completed" : "ended_early",
    distractions: a.distractions,
    notes: notes.trim(),
    quality,
    startedAt: a.startedAt,
    endedAt: end,
  };
}
