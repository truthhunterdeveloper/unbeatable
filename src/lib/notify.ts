/**
 * Notifications. In the iPhone app they are native iOS notifications (they arrive
 * even with the app closed). In a browser they only fire while the tab is open.
 */
import { isNative, notifyNow, requestNativePermission } from "./native";

export function notificationsSupported(): boolean {
  if (isNative) return true;
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (isNative) return "default";
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (isNative) return requestNativePermission();
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function notify(title: string, body: string, tag?: string): boolean {
  if (isNative) {
    notifyNow(title, body).catch(() => {});
    return true;
  }
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  try {
    const n = new Notification(title, { body, tag, icon: `${import.meta.env.BASE_URL}icon.svg`, silent: false });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** A short, soft two-tone chime generated locally (no audio files, no network). */
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, at: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 1);
    };
    play(660, 0);
    play(880, 0.18);
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* audio unavailable */
  }
}
