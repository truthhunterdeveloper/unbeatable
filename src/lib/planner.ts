/**
 * Planning engine: recurrence expansion, conflict detection, layout and
 * realistic workload estimates. It never fills free time automatically.
 */
import type { EventCategory, PlannerEvent, Task } from "@/db/schema";
import { awakeWindow, hmToMin, weekday } from "./date";

export type Occurrence = {
  key: string;
  event: PlannerEvent;
  date: string;
  start: number;
  end: number;
};

export function occursOn(e: PlannerEvent, date: string): boolean {
  if (e.skipDates.includes(date)) return false;
  if (e.repeatDays.length === 0) return e.date === date;
  if (date < e.date) return false;
  if (e.until && date > e.until) return false;
  return e.repeatDays.includes(weekday(date));
}

export function occurrencesOn(events: PlannerEvent[], date: string): Occurrence[] {
  return events
    .filter((e) => occursOn(e, date))
    .map((e) => ({ key: `${e.id}@${date}`, event: e, date, start: hmToMin(e.start), end: hmToMin(e.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.event.title.localeCompare(b.event.title));
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

export function findConflicts(occ: Occurrence[]) {
  const pairs: [Occurrence, Occurrence][] = [];
  const keys = new Set<string>();
  for (let i = 0; i < occ.length; i++) {
    for (let j = i + 1; j < occ.length; j++) {
      if (occ[j].start >= occ[i].end) break; // sorted by start
      if (overlaps(occ[i], occ[j])) {
        pairs.push([occ[i], occ[j]]);
        keys.add(occ[i].key);
        keys.add(occ[j].key);
      }
    }
  }
  return { pairs, keys };
}

/** Column layout so overlapping blocks sit side by side. */
export function layoutColumns(occ: Occurrence[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: Occurrence[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    const assigned: [Occurrence, number][] = [];
    for (const o of cluster) {
      let c = colEnds.findIndex((end) => end <= o.start);
      if (c === -1) {
        c = colEnds.length;
        colEnds.push(o.end);
      } else colEnds[c] = o.end;
      assigned.push([o, c]);
    }
    for (const [o, c] of assigned) out.set(o.key, { col: c, cols: colEnds.length });
    cluster = [];
    clusterEnd = -1;
  };
  for (const o of occ) {
    if (cluster.length && o.start >= clusterEnd) flush();
    cluster.push(o);
    clusterEnd = Math.max(clusterEnd, o.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Blocks scheduled outside the awake window cut into sleep. */
export function sleepIntrusions(occ: Occurrence[], wake: string, bed: string): Occurrence[] {
  const w = awakeWindow(wake, bed);
  return occ.filter((o) => o.start < w.start || o.end > w.end);
}

export function unionMinutes(intervals: { start: number; end: number }[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const iv of sorted) {
    if (iv.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = iv.start;
      curEnd = iv.end;
    } else curEnd = Math.max(curEnd, iv.end);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

export type LoadLevel = "light" | "balanced" | "heavy" | "over";

export type Workload = {
  awakeMin: number;
  committedMin: number;
  byCategory: Partial<Record<EventCategory, number>>;
  taskMin: number;
  taskCount: number;
  unestimatedTasks: number;
  freeMin: number;
  ratio: number;
  level: LoadLevel;
  hasMeals: boolean;
};

/** Share of the awake day we recommend leaving unplanned for the unexpected. */
export const BUFFER_SHARE = 0.2;

/**
 * Workload for a day: committed blocks (overlaps counted once) plus the
 * estimates of open tasks planned for that day that aren't already in a block.
 */
export function workload(occ: Occurrence[], dayTasks: Task[], wake: string, bed: string): Workload {
  const w = awakeWindow(wake, bed);
  const awakeMin = w.end - w.start;
  const committedMin = unionMinutes(occ);
  const byCategory: Partial<Record<EventCategory, number>> = {};
  for (const o of occ) byCategory[o.event.category] = (byCategory[o.event.category] ?? 0) + (o.end - o.start);

  const blockedTaskIds = new Set(occ.map((o) => o.event.taskId).filter(Boolean) as string[]);
  const open = dayTasks.filter((t) => t.status !== "done" && !blockedTaskIds.has(t.id));
  const taskMin = open.reduce((s, t) => s + Math.max(0, (t.estimateMin ?? 0) - t.actualMin), 0);
  const unestimatedTasks = open.filter((t) => t.estimateMin == null).length;

  const used = committedMin + taskMin;
  const ratio = awakeMin > 0 ? used / awakeMin : 0;
  const level: LoadLevel = ratio > 1 ? "over" : ratio > 1 - BUFFER_SHARE ? "heavy" : ratio >= 0.5 ? "balanced" : "light";

  return {
    awakeMin,
    committedMin,
    byCategory,
    taskMin,
    taskCount: open.length,
    unestimatedTasks,
    freeMin: Math.max(0, awakeMin - used),
    ratio,
    level,
    hasMeals: occ.some((o) => o.event.category === "meal"),
  };
}

export const LOAD_COPY: Record<LoadLevel, string> = {
  light: "Giornata leggera — spazio per lavoro profondo o riposo.",
  balanced: "Equilibrata — struttura sufficiente con margine per gli imprevisti.",
  heavy: "Pesante — meno del 20% di margine. Gli imprevisti faranno saltare qualcosa.",
  over: "Sovraccarica — più impegni delle ore di veglia. Sposta o elimina qualcosa.",
};
