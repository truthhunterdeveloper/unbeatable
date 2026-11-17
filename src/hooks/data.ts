import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "@/db/db";
import { logsByHabit, modeLookup } from "@/lib/habits";
import type { Mode } from "@/db/schema";

/** Live queries. `undefined` means "still loading". */

export function useTasks() {
  return useLiveQuery(() => db.tasks.toArray(), []);
}

export function useHabits() {
  return useLiveQuery(() => db.habits.orderBy("order").toArray(), []);
}

export function useHabitLogs(from: string, to: string) {
  const logs = useLiveQuery(() => db.habitLogs.where("date").between(from, to, true, true).toArray(), [from, to]);
  const byHabit = useMemo(() => (logs ? logsByHabit(logs) : undefined), [logs]);
  return { logs, byHabit };
}

/** All logs; needed for honest streaks/recoveries over full history. */
export function useAllHabitLogs() {
  const logs = useLiveQuery(() => db.habitLogs.toArray(), []);
  const byHabit = useMemo(() => (logs ? logsByHabit(logs) : undefined), [logs]);
  return { logs, byHabit };
}

export function useEvents() {
  return useLiveQuery(() => db.events.toArray(), []);
}

export function useFocusSessions(from: string, to: string) {
  return useLiveQuery(() => db.focusSessions.where("date").between(from, to, true, true).toArray(), [from, to]);
}

export function useRecentFocusSessions(limit = 30) {
  return useLiveQuery(() => db.focusSessions.orderBy("startedAt").reverse().limit(limit).toArray(), [limit]);
}

export function useSleepLogs(from: string, to: string) {
  return useLiveQuery(() => db.sleepLogs.where("date").between(from, to, true, true).toArray(), [from, to]);
}

export function useModeOf(currentMode: Mode) {
  const metas = useLiveQuery(() => db.dayMeta.toArray(), []);
  return useMemo(() => (metas ? modeLookup(metas, "standard") : undefined), [metas]) ?? modeLookup([], currentMode);
}
