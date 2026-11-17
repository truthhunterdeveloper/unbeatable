/**
 * Native (iOS via Capacitor) integrations. Every function is a safe no-op in
 * the browser, so the same code runs on the web and in the iPhone app.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import type { Habit, HabitLog } from "@/db/schema";
import { addDays, hmToMin } from "./date";
import { creditOf, scheduledOn } from "./habits";
import { AYAT, QUOTES } from "./quotes";

export const isNative = Capacitor.isNativePlatform();

export const NOTIF_FOCUS_END = 1001;
export const NOTIF_BREAK_END = 1002;
const HABIT_ID_BASE = 2000;
const HABIT_ID_MAX = 9999;

export async function initNative() {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* not critical */
  }
}

export async function nativePermission(): Promise<"granted" | "denied" | "prompt"> {
  const p = await LocalNotifications.checkPermissions();
  return p.display === "granted" ? "granted" : p.display === "denied" ? "denied" : "prompt";
}

export async function requestNativePermission(): Promise<"granted" | "denied"> {
  const p = await LocalNotifications.requestPermissions();
  return p.display === "granted" ? "granted" : "denied";
}

/** Schedules a notification at an exact time; iOS delivers it even if the app is closed. */
export async function scheduleAt(id: number, title: string, body: string, at: Date) {
  if (!isNative || at.getTime() <= Date.now()) return;
  await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at, allowWhileIdle: true } }] });
}

export async function cancelNotifications(ids: number[]) {
  if (!isNative || !ids.length) return;
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
}

export async function notifyNow(title: string, body: string) {
  if (!isNative) return;
  await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random() * 1000) + 10000, title, body, schedule: { at: new Date(Date.now() + 500) } }] });
}

export function tapFeedback() {
  if (!isNative) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/**
 * Plans habit reminders for the next 7 days as individual one-off notifications,
 * skipping days that aren't scheduled and today's reminder when it's already done.
 * Re-run whenever habits, logs or settings change.
 */
export async function syncHabitReminders(habits: Habit[], todayLogs: Map<string, HabitLog>, today: string, enabled: boolean) {
  if (!isNative) return;
  const pending = await LocalNotifications.getPending();
  const old = pending.notifications.filter((n) => n.id >= HABIT_ID_BASE && n.id <= HABIT_ID_MAX).map((n) => n.id);
  await cancelNotifications(old);
  if (!enabled) return;
  const list: { id: number; title: string; body: string; schedule: { at: Date } }[] = [];
  habits.forEach((h, hi) => {
    if (h.archived || !h.reminderTime) return;
    for (let d = 0; d < 7; d++) {
      const date = addDays(today, d);
      if (!scheduledOn(h, date)) continue;
      if (d === 0) {
        const log = todayLogs.get(h.id);
        if (log?.excused || creditOf(h, log) >= 1) continue;
      }
      const [y, m, day] = date.split("-").map(Number);
      const min = hmToMin(h.reminderTime);
      const at = new Date(y, m - 1, day, Math.floor(min / 60), min % 60);
      if (at.getTime() <= Date.now()) continue;
      const id = HABIT_ID_BASE + ((hi * 7 + d) % (HABIT_ID_MAX - HABIT_ID_BASE));
      list.push({ id, title: h.name, body: h.description || "È il momento previsto.", schedule: { at } });
    }
  });
  if (list.length) await LocalNotifications.schedule({ notifications: list.slice(0, 30) });
}

const MOTIV_BASE = 20000;

/**
 * Motivational notifications every `everyHours` during waking hours, mixing
 * Comeback/discipline lines and ayat. iOS keeps at most 64 pending, so we plan
 * the next ~30 and top them up every time the app opens.
 */
export async function syncMotivation(everyHours: number, wake: string, bed: string, enabled: boolean) {
  if (!isNative) return;
  const pending = await LocalNotifications.getPending();
  await cancelNotifications(pending.notifications.filter((n) => n.id >= MOTIV_BASE && n.id < MOTIV_BASE + 1000).map((n) => n.id));
  if (!enabled || everyHours <= 0) return;
  const lines = [...QUOTES.comeback, ...QUOTES.discipline];
  const start = hmToMin(wake) + 30;
  const end = hmToMin(bed) - 30;
  const list: { id: number; title: string; body: string; schedule: { at: Date } }[] = [];
  const now = new Date();
  for (let d = 0; d < 14 && list.length < 30; d++) {
    for (let m = start; m <= end && list.length < 30; m += everyHours * 60) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, Math.floor(m / 60), m % 60);
      if (at.getTime() <= Date.now() + 60_000) continue;
      const n = Math.floor(at.getTime() / 3_600_000);
      const ayah = n % 4 === 0 ? AYAT[n % AYAT.length] : null;
      list.push({
        id: MOTIV_BASE + list.length,
        title: ayah ? `Qur’an ${ayah.ref}` : "Unbeatable",
        body: ayah ? `${ayah.ar}
${ayah.it}` : lines[n % lines.length],
        schedule: { at },
      });
    }
  }
  if (list.length) await LocalNotifications.schedule({ notifications: list });
}
