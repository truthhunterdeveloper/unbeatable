import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { ActiveFocus, FocusKind } from "@/db/schema";
import { clearActiveFocus, getActiveFocus, saveFocusSession, setActiveFocus, uid } from "@/db/repo";
import * as F from "@/lib/focus";
import { chime, notify } from "@/lib/notify";
import { NOTIF_BREAK_END, NOTIF_FOCUS_END, cancelNotifications, isNative, scheduleAt } from "@/lib/native";
import { dateOfMs, formatClock } from "@/lib/date";
import { useApp } from "@/hooks/app";

type StartArgs = { taskId: string | null; label: string; domain: string | null; kind: FocusKind; plannedMin: number };

type FocusApi = {
  /** undefined = loading, null = idle */
  active: ActiveFocus | null | undefined;
  now: number;
  start: (a: StartArgs) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<void>;
  extend: (min: number) => Promise<void>;
  distraction: (note: string) => Promise<void>;
  save: (notes: string, quality: number | null) => Promise<void>;
  discard: () => Promise<void>;
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
};

const Ctx = createContext<FocusApi | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const { settings, tz } = useApp();
  const stored = useLiveQuery(() => getActiveFocus(), []);
  const [now, setNow] = useState(() => Date.now());
  const handled = useRef<string | null>(null);
  const lastBreakMin = useRef(settings.breakMinutes);
  const lastLabel = useRef("");

  const active = stored;
  const ticking = !!active && (F.isRunning(active) || active.phase === "break");

  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [ticking]);

  // Transitions driven by time: focus target reached, break finished.
  useEffect(() => {
    if (!active) return;
    const t = Date.now();
    if (active.phase === "focus") {
      const next = F.tick(active, t);
      if (next !== active && handled.current !== active.id + ":done") {
        handled.current = active.id + ":done";
        setActiveFocus(next).catch(() => {});
        if (settings.notifications && !isNative) notify("Sessione di focus completata", `${active.label} — ${active.plannedMin} minuti di lavoro concentrato.`, "focus");
        chime();
      }
    } else if (active.phase === "break" && active.breakEndsAt != null && t >= active.breakEndsAt) {
      if (handled.current !== active.id + ":break") {
        handled.current = active.id + ":break";
        clearActiveFocus().catch(() => {});
        if (settings.notifications && !isNative) notify("Pausa finita", "Pronto per il prossimo blocco quando vuoi.", "focus");
        chime();
      }
    }
  }, [active, now, settings.notifications]);

  // iPhone app: let iOS deliver the end-of-session / end-of-break alert even if the app is closed.
  const sig = active ? `${active.id}|${active.phase}|${active.runningSince}|${active.plannedMin}|${active.accumulatedMs}|${active.breakEndsAt}` : "none";
  useEffect(() => {
    if (!isNative) return;
    (async () => {
      await cancelNotifications([NOTIF_FOCUS_END, NOTIF_BREAK_END]);
      if (!settings.notifications || !active) return;
      if (active.phase === "focus" && active.runningSince != null) {
        const end = active.runningSince + (F.plannedMs(active) - active.accumulatedMs);
        await scheduleAt(NOTIF_FOCUS_END, "Sessione di focus completata", `${active.label} — ${active.plannedMin} minuti di lavoro concentrato.`, new Date(end));
      } else if (active.phase === "break" && active.breakEndsAt) {
        await scheduleAt(NOTIF_BREAK_END, "Pausa finita", "Pronto per il prossimo blocco quando vuoi.", new Date(active.breakEndsAt));
      }
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, settings.notifications]);

  // Live remaining time in the tab title.
  useEffect(() => {
    const base = "Unbeatable";
    if (!active) {
      document.title = base;
      return;
    }
    if (active.phase === "review") document.title = `Sessione completata · ${base}`;
    else if (active.phase === "break") document.title = `${formatClock(F.remainingMs(active, now))} pausa · ${base}`;
    else document.title = `${formatClock(F.remainingMs(active, now))}${active.runningSince == null ? " (in pausa)" : ""} · ${active.label}`;
  }, [active, now]);

  const update = useCallback(
    async (fn: (a: ActiveFocus, t: number) => ActiveFocus) => {
      const cur = await getActiveFocus();
      if (!cur) return;
      const next = fn(cur, Date.now());
      if (next !== cur) await setActiveFocus(next);
    },
    [],
  );

  const api: FocusApi = {
    active,
    now,
    start: async (a) => {
      const cur = await getActiveFocus();
      if (cur && cur.phase !== "break") throw new Error("C'è già una sessione in corso.");
      lastBreakMin.current = settings.breakMinutes;
      lastLabel.current = a.label;
      await setActiveFocus(F.startFocus({ ...a, id: uid(), breakMin: settings.breakMinutes }, Date.now()));
    },
    pause: () => update(F.pause),
    resume: () => update(F.resume),
    finish: () => update(F.finishEarly),
    extend: (min) => update((a, t) => F.extend(a, min, t)),
    distraction: (note) => update((a, t) => F.logDistraction(a, note, t)),
    save: async (notes, quality) => {
      const cur = await getActiveFocus();
      if (!cur || cur.phase !== "review") return;
      const date = dateOfMs(cur.startedAt, tz);
      await saveFocusSession(F.toSession(cur, date, notes, quality));
      lastBreakMin.current = cur.breakMin;
      lastLabel.current = cur.label;
      await clearActiveFocus();
    },
    discard: async () => {
      await clearActiveFocus();
    },
    startBreak: async () => {
      await setActiveFocus(F.startBreak({ id: "", breakMin: lastBreakMin.current, label: lastLabel.current || "Break" }, Date.now(), uid()));
    },
    endBreak: async () => {
      await clearActiveFocus();
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFocus(): FocusApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFocus must be used inside FocusProvider");
  return ctx;
}
