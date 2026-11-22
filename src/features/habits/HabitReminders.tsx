import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Habit, HabitLog } from "@/db/schema";
import { isNative, syncBlockChecks, syncHabitReminders, syncMotivation } from "@/lib/native";
import { db } from "@/db/db";
import { useApp } from "@/hooks/app";
import { creditOf, isExpected, modeLookup, scheduledOn } from "@/lib/habits";
import { hmToMin } from "@/lib/date";
import { notify } from "@/lib/notify";
import { motivationAt, motivationMinutes } from "@/lib/quotes";
import { useToast } from "@/components/ui/toast";

/**
 * Fires a browser notification at a habit's reminder time if it isn't done yet.
 * Runs only while the app is open. Each reminder fires at most once per day.
 */
export function HabitReminders() {
  const { settings, today, nowMin } = useApp();
  // iPhone app: schedule real iOS notifications for the next 7 days and resync on every change.
  const nativeSig = useLiveQuery(
    async () => (isNative ? JSON.stringify([await db.habits.toArray(), await db.habitLogs.where("date").equals(today).toArray()]) : ""),
    [today],
  );
  useEffect(() => {
    if (!isNative || nativeSig === undefined) return;
    const [habits, logs] = JSON.parse(nativeSig) as [Habit[], HabitLog[]];
    syncHabitReminders(habits, new Map(logs.map((l) => [l.habitId, l])), today, settings.notifications).catch(() => {});
  }, [nativeSig, today, settings.notifications]);

  const eventsSig = useLiveQuery(async () => (isNative ? JSON.stringify(await db.events.toArray()) : ""), []);
  useEffect(() => {
    if (!isNative || eventsSig === undefined) return;
    syncBlockChecks(JSON.parse(eventsSig), today, settings.notifications).catch(() => {});
  }, [eventsSig, today, settings.notifications]);

  useEffect(() => {
    syncMotivation(motivationMinutes(settings), settings.wakeTime, settings.bedTime, settings.notifications).catch(() => {});
  }, [today, settings.motivationEvery, settings.motivationMinutes, settings.wakeTime, settings.bedTime, settings.notifications]);

  // Web / Home-screen app: while it is open, a motivational message every N minutes
  // (toast inside the app, plus a system notification when allowed).
  const toast = useToast();
  const every = motivationMinutes(settings);
  useEffect(() => {
    if (isNative || every <= 0) return;
    const t = setInterval(() => {
      const m = minutesNow();
      if (m < hmToMin(settings.wakeTime) || m > hmToMin(settings.bedTime)) return;
      const msg = motivationAt(Date.now(), every);
      toast.info(msg.body.split("\n").pop() ?? msg.body);
      if (settings.notifications) notify(msg.title, msg.body, "motivation");
    }, every * 60_000);
    return () => clearInterval(t);
  }, [every, settings.wakeTime, settings.bedTime, settings.notifications, toast]);

  useEffect(() => {
    if (isNative || !settings.notifications) return;
    let cancelled = false;
    (async () => {
      const habits = (await db.habits.toArray()).filter((h) => !h.archived && h.reminderTime && scheduledOn(h, today));
      if (!habits.length) return;
      const metas = await db.dayMeta.toArray();
      const mode = modeLookup(metas, settings.mode)(today);
      for (const h of habits) {
        if (cancelled) return;
        const at = hmToMin(h.reminderTime!);
        // Fire within a 30-minute window after the reminder time.
        if (nowMin < at || nowMin > at + 30) continue;
        if (h.tier !== "optional" && !isExpected(h, today, mode)) continue;
        const key = `dos:reminded:${h.id}:${today}`;
        try {
          if (localStorage.getItem(key)) continue;
        } catch {
          /* ignore */
        }
        const log = await db.habitLogs.get(`${h.id}:${today}`);
        if (log?.excused || creditOf(h, log) >= 1) continue;
        if (notify(h.name, h.description || "Previsto per adesso.", `habit-${h.id}`)) {
          try {
            localStorage.setItem(key, "1");
          } catch {
            /* ignore */
          }
        }
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings.notifications, settings.mode, today, nowMin]);

  return null;
}

function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
