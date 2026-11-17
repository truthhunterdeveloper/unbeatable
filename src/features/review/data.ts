import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useApp } from "@/hooks/app";
import { useAllHabitLogs, useHabits, useModeOf, useTasks } from "@/hooks/data";
import type { ScoreInput } from "@/lib/analytics";

/** Everything the score and the weekly review need, for an arbitrary date window. */
export function useAnalyticsData(from: string, to: string) {
  const { settings, today, tz } = useApp();
  const habits = useHabits();
  const { byHabit } = useAllHabitLogs();
  const modeOf = useModeOf(settings.mode);
  const tasks = useTasks();
  const sessions = useLiveQuery(() => db.focusSessions.where("date").between(from, to, true, true).toArray(), [from, to]);
  const sleeps = useLiveQuery(() => db.sleepLogs.where("date").between(from, to, true, true).toArray(), [from, to]);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  if (!habits || !byHabit || !tasks || !sessions || !sleeps || !goals) return null;
  const input = (wFrom: string, wTo: string): ScoreInput => ({
    from: wFrom,
    to: wTo,
    today,
    tz,
    habits,
    byHabit,
    modeOf,
    tasks,
    sessions: sessions.filter((s) => s.date >= wFrom && s.date <= wTo),
    sleeps: sleeps.filter((s) => s.date >= wFrom && s.date <= wTo),
  });
  return { input, goals, habits, byHabit, modeOf, tasks, sessions, sleeps };
}
