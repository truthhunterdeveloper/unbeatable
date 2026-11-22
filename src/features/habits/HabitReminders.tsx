import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Habit, HabitLog } from "@/db/schema";
import { isNative, syncPrayerAlerts, syncBlockChecks, syncHabitReminders, syncMotivation } from "@/lib/native";
import { db } from "@/db/db";
import { useApp } from "@/hooks/app";
import { creditOf, isExpected, modeLookup, scheduledOn } from "@/lib/habits";
import { hmToMin } from "@/lib/date";
import { notify } from "@/lib/notify";
import { isCheckable } from "@/lib/checks";
import { hm, prayerTimes } from "@/lib/prayer";
import { occurrencesOn } from "@/lib/planner";
import { motivationAt, motivationMinutes } from "@/lib/quotes";
import { useToast } from "@/components/ui/toast";

/**
 * Fires a browser notification at a habit's reminder time if it isn't done yet.
 * Runs only while the app is open. Each reminder fires at most once per day.
 */
export function HabitReminders() {
  const { settings, today, nowMin } = useApp();
  const toast = useToast();
  const warned = useRef(new Set<string>());
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
    syncBlockChecks(JSON.parse(eventsSig), today, settings.notifications && settings.blockChecks !== false, settings.notifications ? (settings.preBlockMin ?? 5) : 0).catch(() => {});
  }, [eventsSig, today, settings.notifications, settings.blockChecks, settings.preBlockMin]);

  const prayerOn = settings.prayerAlerts !== false && settings.prayerLat != null;
  useEffect(() => {
    syncPrayerAlerts(settings.prayerLat, settings.prayerLon, settings.notifications && prayerOn).catch(() => {});
  }, [today, settings.prayerLat, settings.prayerLon, settings.notifications, prayerOn]);

  // Web: prayer reminder while the app is open.
  useEffect(() => {
    if (isNative || !prayerOn) return;
    const now = new Date();
    for (const p of prayerTimes(settings.prayerLat!, settings.prayerLon!, now)) {
      const m = p.at.getHours() * 60 + p.at.getMinutes();
      const key = `prayer-${today}-${p.key}`;
      if (nowMin < m || nowMin > m + 10 || warned.current.has(key)) continue;
      warned.current.add(key);
      toast.info(`🕌 ${p.name} (${hm(p.at)}): è il momento della salah`);
      if (settings.notifications) notify(`🕌 ${p.name}`, "È il momento della salah.", key);
    }
  }, [nowMin, today, prayerOn, settings.prayerLat, settings.prayerLon, settings.notifications, toast]);

  // Web: heads-up before each block while the app is open.
  const preMin = settings.preBlockMin ?? 5;
  const webEvents = useLiveQuery(() => (isNative ? [] : db.events.toArray()), []);
  useEffect(() => {
    if (isNative || preMin <= 0 || !webEvents) return;
    for (const o of occurrencesOn(webEvents.filter(isCheckable), today)) {
      const key = `${o.key}`;
      if (warned.current.has(key) || nowMin < o.start - preMin || nowMin >= o.start) continue;
      warned.current.add(key);
      const body = o.event.category === "study" ? "Prepara libro e quaderno. Telefono in Full immersion." : "Preparati, si parte.";
      toast.info(`Tra ${o.start - nowMin} min: ${o.event.title}`);
      if (settings.notifications) notify(`Tra ${o.start - nowMin} min: ${o.event.title}`, body, `pre-${key}`);
    }
  }, [nowMin, today, preMin, webEvents, settings.notifications, toast]);

  useEffect(() => {
    syncMotivation(motivationMinutes(settings), settings.motivationFrom ?? settings.wakeTime, settings.motivationTo ?? settings.bedTime, settings.notifications).catch(() => {});
  }, [today, settings.motivationEvery, settings.motivationMinutes, settings.motivationFrom, settings.motivationTo, settings.wakeTime, settings.bedTime, settings.notifications]);

  // Web / Home-screen app: while it is open, a motivational message every N minutes
  // (toast inside the app, plus a system notification when allowed).
  const every = motivationMinutes(settings);
  const from = settings.motivationFrom ?? settings.wakeTime;
  const to = settings.motivationTo ?? settings.bedTime;
  useEffect(() => {
    if (isNative || every <= 0) return;
    const t = setInterval(() => {
      const m = minutesNow();
      if (m < hmToMin(from) || m > hmToMin(to)) return;
      const msg = motivationAt(Date.now(), every);
      toast.info(msg.body.split("\n").pop() ?? msg.body);
      if (settings.notifications) notify(msg.title, msg.body, "motivation");
    }, every * 60_000);
    return () => clearInterval(t);
  }, [every, from, to, settings.notifications, toast]);

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
