/**
 * Habit Engine logic.
 *
 * Principles encoded here:
 *  - Consistency is a rate over expected days, not a fragile streak.
 *  - Partial completion earns partial credit (value / target, capped at 1).
 *  - Excused days (rest, illness, injury, travel) leave the denominator.
 *  - Optional habits are always a bonus and are never "missed".
 *  - In Recovery mode only essential habits are expected.
 *  - Today is not judged until it is over: it only enters the rate once completed.
 *  - Recovery after a miss ("never miss twice") is tracked explicitly.
 */
import type { DayMeta, Habit, HabitLog, Mode } from "@/db/schema";
import { addDays, dateRange, daysBetween, startOfWeek, weekday } from "./date";

export type ModeOf = (date: string) => Mode;

/** Mode in effect on a date: the most recent recorded mode on or before it. */
export function modeLookup(metas: DayMeta[], fallback: Mode = "standard"): ModeOf {
  const sorted = [...metas].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return (date) => {
    let lo = 0;
    let hi = sorted.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].date <= date) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans >= 0 ? sorted[ans].mode : fallback;
  };
}

export function scheduledOn(h: Habit, date: string): boolean {
  if (date < h.startDate) return false;
  switch (h.frequency.type) {
    case "daily":
    case "weekly":
      return true;
    case "days":
      return h.frequency.days.includes(weekday(date));
  }
}

/** Whether the habit counts toward consistency on this date. */
export function isExpected(h: Habit, date: string, mode: Mode): boolean {
  if (!scheduledOn(h, date)) return false;
  if (h.tier === "optional") return false;
  if (mode === "recovery" && h.tier !== "essential") return false;
  return true;
}

export function creditOf(h: Habit, log: HabitLog | undefined): number {
  if (!log || log.excused) return 0;
  return Math.min(1, log.value / h.target);
}

export type DayState = "done" | "partial" | "missed" | "excused" | "not-required" | "pending" | "upcoming" | "open" | "off";

export function dayState(h: Habit, date: string, log: HabitLog | undefined, mode: Mode, today: string): DayState {
  if (date < h.startDate) return "off";
  if (log?.excused) return "excused";
  const c = creditOf(h, log);
  if (c >= 1) return "done";
  if (c > 0) return "partial";
  if (date > today) return scheduledOn(h, date) ? "upcoming" : "off";
  if (!scheduledOn(h, date)) return "off";
  if (h.frequency.type === "weekly") return date === today ? "pending" : "open";
  if (!isExpected(h, date, mode)) return "not-required";
  return date === today ? "pending" : "missed";
}

export type LogMap = Map<string, HabitLog>; // key: date

export function logsByHabit(logs: HabitLog[]): Map<string, LogMap> {
  const out = new Map<string, LogMap>();
  for (const l of logs) {
    let m = out.get(l.habitId);
    if (!m) out.set(l.habitId, (m = new Map()));
    m.set(l.date, l);
  }
  return out;
}

export type HabitStats = {
  /** Expected occurrences in the window (fractional for weekly habits). */
  expected: number;
  credit: number;
  /** credit / expected, or null when nothing was expected. */
  rate: number | null;
  completedDays: number;
  excusedDays: number;
  /** Dates (or week-start dates for weekly habits) that were missed. */
  missed: string[];
  currentStreak: number;
  bestStreak: number;
  /** Misses that had a following opportunity, and how many of those were recovered. */
  misses: number;
  recoveries: number;
  streakUnit: "day" | "week";
};

export function habitStats(h: Habit, logs: LogMap, from: string, to: string, today: string, modeOf: ModeOf): HabitStats {
  return h.frequency.type === "weekly"
    ? weeklyStats(h, h.frequency.timesPerWeek, logs, from, to, today, modeOf)
    : dailyStats(h, logs, from, to, today, modeOf);
}

function dailyStats(h: Habit, logs: LogMap, from: string, to: string, today: string, modeOf: ModeOf): HabitStats {
  let expected = 0;
  let credit = 0;
  let completedDays = 0;
  let excusedDays = 0;
  const missed: string[] = [];
  const start = from < h.startDate ? h.startDate : from;
  const end = to > today ? today : to;

  if (start <= end) {
    for (const date of dateRange(start, end)) {
      const log = logs.get(date);
      const c = creditOf(h, log);
      if (c >= 1) completedDays++;
      if (!isExpected(h, date, modeOf(date))) continue;
      if (log?.excused) {
        excusedDays++;
        continue;
      }
      if (date === today && c < 1) continue; // the day isn't over
      expected++;
      credit += c;
      if (c === 0) missed.push(date);
    }
  }

  // Streaks and recoveries consider the whole history up to today.
  let run = 0;
  let best = 0;
  let misses = 0;
  let recoveries = 0;
  let prevMissed = false;
  if (h.startDate <= today) {
    for (const date of dateRange(h.startDate, today)) {
      if (!isExpected(h, date, modeOf(date))) continue;
      const log = logs.get(date);
      if (log?.excused) continue;
      const c = creditOf(h, log);
      const isToday = date === today;
      if (isToday && c === 0) break; // undecided
      if (prevMissed) {
        misses++;
        if (c > 0) recoveries++;
      }
      if (c >= 1) {
        run++;
        best = Math.max(best, run);
      } else if (!isToday) {
        run = 0;
      }
      prevMissed = c === 0 && !isToday;
    }
  }

  return {
    expected,
    credit,
    rate: expected > 0 ? credit / expected : null,
    completedDays,
    excusedDays,
    missed,
    currentStreak: run,
    bestStreak: best,
    misses,
    recoveries,
    streakUnit: "day",
  };
}

function weeklyStats(h: Habit, target: number, logs: LogMap, from: string, to: string, today: string, modeOf: ModeOf): HabitStats {
  const end = to > today ? today : to;
  const weekStats = (ws: string, clipFrom: string, clipTo: string) => {
    const we = addDays(ws, 6);
    const a = clipFrom > ws ? clipFrom : ws;
    const b0 = clipTo < we ? clipTo : we;
    const b = b0 > today ? today : b0;
    let counted = 0;
    let done = 0;
    let completedDays = 0;
    let excused = 0;
    if (a <= b) {
      for (const d of dateRange(a, b)) {
        if (d < h.startDate) continue;
        const log = logs.get(d);
        const c = creditOf(h, log);
        done += c;
        if (c >= 1) completedDays++;
        if (log?.excused) {
          excused++;
          continue;
        }
        if (isExpected(h, d, modeOf(d))) counted++;
      }
    }
    const finished = we < today;
    // Full weeks expect the target, scaled by the share of days that counted
    // (excused days and recovery days shrink the expectation).
    let expected = (target * counted) / 7;
    if (!finished) {
      // Current week: only expect what pace requires so far.
      expected = Math.min(target, Math.max(Math.min(done, target), Math.floor(expected)));
    } else {
      // Partial weeks (habit start, recovery or excused days) only expect whole sessions.
      expected = counted >= 7 ? target : Math.min(target, Math.floor(expected));
    }
    return { expected, credit: Math.min(done, expected), done, finished, completedDays, excused };
  };

  let expected = 0;
  let credit = 0;
  let completedDays = 0;
  let excusedDays = 0;
  const missed: string[] = [];
  const start = from < h.startDate ? h.startDate : from;
  if (start <= end) {
    for (let ws = startOfWeek(start, 1); ws <= end; ws = addDays(ws, 7)) {
      const w = weekStats(ws, start, end);
      expected += w.expected;
      credit += w.credit;
      completedDays += w.completedDays;
      excusedDays += w.excused;
      if (w.finished && w.expected > 0 && w.credit + 1e-9 < w.expected) missed.push(ws);
    }
  }

  // Week streaks over full history.
  let run = 0;
  let best = 0;
  let misses = 0;
  let recoveries = 0;
  let prevMissed = false;
  if (h.startDate <= today) {
    for (let ws = startOfWeek(h.startDate, 1); ws <= today; ws = addDays(ws, 7)) {
      const w = weekStats(ws, h.startDate, today);
      const fullTarget = w.finished ? w.expected : target;
      if (fullTarget <= 0) continue;
      const met = w.done + 1e-9 >= fullTarget;
      if (!w.finished && !met) break; // current week undecided
      if (prevMissed) {
        misses++;
        if (w.done > 0) recoveries++;
      }
      if (met) {
        run++;
        best = Math.max(best, run);
      } else run = 0;
      prevMissed = !met;
    }
  }

  return {
    expected,
    credit,
    rate: expected > 0 ? credit / expected : null,
    completedDays,
    excusedDays,
    missed,
    currentStreak: run,
    bestStreak: best,
    misses,
    recoveries,
    streakUnit: "week",
  };
}

/** Progress for a weekly habit in the week containing `date`. */
export function weekProgress(h: Habit, logs: LogMap, date: string): { done: number; target: number } {
  if (h.frequency.type !== "weekly") return { done: 0, target: 0 };
  const ws = startOfWeek(date, 1);
  let done = 0;
  for (let i = 0; i < 7; i++) done += creditOf(h, logs.get(addDays(ws, i)));
  return { done, target: h.frequency.timesPerWeek };
}

/**
 * Daily completion across all day-based habits (weekly-quota habits are
 * excluded because a single day says nothing about them).
 * For today, everything expected is in the denominator — it reads as "x of y so far".
 */
export function dayCompletion(habits: Habit[], byHabit: Map<string, LogMap>, date: string, modeOf: ModeOf) {
  let expected = 0;
  let credit = 0;
  let bonus = 0;
  for (const h of habits) {
    if (h.archived || h.frequency.type === "weekly") continue;
    const log = byHabit.get(h.id)?.get(date);
    if (!isExpected(h, date, modeOf(date))) {
      if (creditOf(h, log) >= 1) bonus++;
      continue;
    }
    if (log?.excused) continue;
    expected++;
    credit += creditOf(h, log);
  }
  return { expected, credit, bonus, rate: expected > 0 ? credit / expected : null };
}

/** Aggregate consistency across habits for a window (credit-weighted). */
export function overallConsistency(habits: Habit[], byHabit: Map<string, LogMap>, from: string, to: string, today: string, modeOf: ModeOf) {
  let expected = 0;
  let credit = 0;
  for (const h of habits) {
    if (h.archived) continue;
    const s = habitStats(h, byHabit.get(h.id) ?? new Map(), from, to, today, modeOf);
    expected += s.expected;
    credit += s.credit;
  }
  return { expected, credit, rate: expected > 0 ? credit / expected : null };
}

export function describeFrequency(h: Pick<Habit, "frequency">): string {
  const f = h.frequency;
  if (f.type === "daily") return "Ogni giorno";
  if (f.type === "weekly") return `${f.timesPerWeek}× a settimana`;
  const days = [...f.days].sort();
  if (days.length === 7) return "Ogni giorno";
  if (days.join() === "1,2,3,4,5") return "Giorni feriali";
  if (days.join() === "0,6") return "Weekend";
  return days.map((d) => ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"][d]).join(" · ");
}

export function daysSince(date: string, today: string) {
  return daysBetween(date, today);
}
