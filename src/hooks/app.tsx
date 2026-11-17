import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Domain, Settings, Task } from "@/db/schema";
import type { TaskInput } from "@/db/repo";
import { ensureDayMeta } from "@/db/repo";
import { seedSubjects } from "@/lib/seed";
import { minutesOfDay, safeTimeZone, todayISO } from "@/lib/date";

type TaskDialogState = { open: boolean; task?: Task; defaults?: Partial<TaskInput> };

export type AppContextValue = {
  settings: Settings;
  tz: string;
  now: number;
  today: string;
  nowMin: number;
  /** Enabled domains, in user order. */
  domains: Domain[];
  domain: (id: string | null | undefined) => Domain | undefined;
  taskDialog: TaskDialogState;
  openTask: (task?: Task, defaults?: Partial<TaskInput>) => void;
  closeTask: () => void;
  palette: boolean;
  setPalette: (v: boolean) => void;
  shortcuts: boolean;
  setShortcuts: (v: boolean) => void;
  sleepDialog: boolean;
  setSleepDialog: (v: boolean) => void;
};

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ settings, children }: { settings: Settings; children: ReactNode }) {
  const tz = safeTimeZone(settings.timeZone);
  const [now, setNow] = useState(() => Date.now());
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>({ open: false });
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [sleepDialog, setSleepDialog] = useState(false);

  // Coarse clock for "today" and greetings. Focus timers keep their own fast clock.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    const onVis = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const today = todayISO(tz, now);
  const nowMin = minutesOfDay(now, tz);

  useEffect(() => {
    ensureDayMeta(today, settings.mode).catch(() => {});
    seedSubjects(today).catch(() => {});
  }, [today, settings.mode]);

  const domainMap = useMemo(() => new Map(settings.domains.map((d) => [d.id, d])), [settings.domains]);
  const domains = useMemo(() => settings.domains.filter((d) => d.enabled), [settings.domains]);
  const domain = useCallback((id: string | null | undefined) => (id ? domainMap.get(id) : undefined), [domainMap]);

  const openTask = useCallback((task?: Task, defaults?: Partial<TaskInput>) => setTaskDialog({ open: true, task, defaults }), []);
  const closeTask = useCallback(() => setTaskDialog((s) => ({ ...s, open: false })), []);

  const value: AppContextValue = {
    settings,
    tz,
    now,
    today,
    nowMin,
    domains,
    domain,
    taskDialog,
    openTask,
    closeTask,
    palette,
    setPalette,
    shortcuts,
    setShortcuts,
    sleepDialog,
    setSleepDialog,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
