/**
 * Phase 3 — Discipline Score, weekly facts and rule-based suggestions.
 *
 * DISCIPLINE SCORE (0–100), documented and inspectable in the app:
 *
 *   Component        Weight  Value (0–1)
 *   Costanza          35     habit credit ÷ expected (essential ×2, standard ×1)
 *   Priorità          25     Mission tasks completed ÷ Mission tasks pinned
 *   Lavoro profondo   15     days with ≥20 min focus ÷ min(5, eligible days)
 *   Recupero          25     logged nights ≥ 8 h ÷ logged nights
 *
 *   score = 100 × Σ(weight × value) ÷ Σ(weight of components that have data)
 *
 * Fairness rules:
 *   - Excused habit days and optional habits never count.
 *   - Recovery-mode days are removed from Priorities and Deep work.
 *   - A component without data is excluded, not counted as zero; a week with no data has no score.
 *   - Deep work rewards regularity (max 5 days), never long hours.
 *   - The score describes a week of actions, not a person.
 */
import type { DomainRecord, FocusSession, Goal, Habit, SleepLog, Task } from "@/db/schema";
import { addDays, dateOfMs, dateRange, daysBetween, minutesOfDay, sleepMinutes, weekday } from "./date";
import { habitStats, type LogMap, type ModeOf } from "./habits";

export const FOCUS_DAY_MIN = 20;
export const SLEEP_OK_MIN = 8 * 60;

export type ScoreComponent = {
  id: "consistency" | "priorities" | "focus" | "recovery";
  label: string;
  weight: number;
  /** 0..1, or null when there's no data (then it's excluded). */
  value: number | null;
  detail: string;
  formula: string;
};

export type ScoreInput = {
  from: string;
  to: string;
  today: string;
  tz: string;
  habits: Habit[];
  byHabit: Map<string, LogMap>;
  modeOf: ModeOf;
  tasks: Task[];
  sessions: FocusSession[];
  sleeps: SleepLog[];
};

export type WeekScore = { score: number | null; components: ScoreComponent[]; coveredWeight: number };

export function weekScore(i: ScoreInput): WeekScore {
  const end = i.to > i.today ? i.today : i.to;
  const days = end >= i.from ? dateRange(i.from, end) : [];
  const activeDays = days.filter((d) => i.modeOf(d) !== "recovery");

  // 1. Consistency
  let wExp = 0;
  let wCred = 0;
  for (const h of i.habits) {
    if (h.archived || h.tier === "optional") continue;
    const w = h.tier === "essential" ? 2 : 1;
    const s = habitStats(h, i.byHabit.get(h.id) ?? new Map(), i.from, end, i.today, i.modeOf);
    wExp += w * s.expected;
    wCred += w * s.credit;
  }
  const consistency = wExp > 0 ? wCred / wExp : null;

  // 2. Priorities (Today's Mission)
  const active = new Set(activeDays);
  const mission = i.tasks.filter((t) => t.missionDate && active.has(t.missionDate));
  const missionDone = mission.filter((t) => t.status === "done").length;
  const priorities = mission.length ? missionDone / mission.length : null;

  // 3. Deep work regularity
  const minByDay = new Map<string, number>();
  for (const s of i.sessions) minByDay.set(s.date, (minByDay.get(s.date) ?? 0) + s.actualSec / 60);
  const focusDays = activeDays.filter((d) => (minByDay.get(d) ?? 0) >= FOCUS_DAY_MIN).length;
  const focusTarget = Math.min(5, activeDays.length);
  const focus = focusTarget > 0 ? Math.min(1, focusDays / focusTarget) : null;

  // 4. Recovery (sleep)
  const nights = i.sleeps.filter((s) => s.date >= i.from && s.date <= end);
  const okNights = nights.filter((s) => sleepMinutes(s.bedTime, s.wakeTime) >= SLEEP_OK_MIN).length;
  const recovery = nights.length ? okNights / nights.length : null;

  const components: ScoreComponent[] = [
    {
      id: "consistency",
      label: "Costanza",
      weight: 35,
      value: consistency,
      detail: wExp > 0 ? `${round1(wCred)} di ${round1(wExp)} punti abitudine (essenziali ×2)` : "Nessuna abitudine prevista",
      formula: "credito abitudini ÷ previsto · essenziali valgono doppio · giorni giustificati e abitudini facoltative esclusi",
    },
    {
      id: "priorities",
      label: "Priorità",
      weight: 25,
      value: priorities,
      detail: mission.length ? `${missionDone} di ${mission.length} attività della Missione completate` : "Nessuna attività fissata nella Missione",
      formula: "attività della Missione completate ÷ fissate · giorni in modalità Recupero esclusi",
    },
    {
      id: "focus",
      label: "Lavoro profondo",
      weight: 15,
      value: focus,
      detail: focusTarget ? `${focusDays} giorni con almeno ${FOCUS_DAY_MIN} min di focus (obiettivo ${focusTarget})` : "Nessun giorno valido",
      formula: `giorni con ≥${FOCUS_DAY_MIN} min di focus ÷ min(5, giorni non in Recupero) · conta la regolarità, non le ore`,
    },
    {
      id: "recovery",
      label: "Recupero",
      weight: 25,
      value: recovery,
      detail: nights.length ? `${okNights} di ${nights.length} notti registrate con almeno 8 h` : "Nessuna notte registrata",
      formula: "notti con ≥8 h di sonno ÷ notti registrate · le notti non registrate non contano",
    },
  ];
  // A week with nothing recorded at all has no score (not a zero).
  const anyData = wExp > 0 || mission.length > 0 || nights.length > 0 || i.sessions.some((x) => x.date >= i.from && x.date <= end);
  if (!anyData) for (const c of components) c.value = null;
  const covered = components.filter((c) => c.value != null);
  const coveredWeight = covered.reduce((a, c) => a + c.weight, 0);
  const score = coveredWeight ? Math.round((100 * covered.reduce((a, c) => a + c.weight * c.value!, 0)) / coveredWeight) : null;
  return { score, components, coveredWeight };
}

/* ───────────────────────── Weekly facts ───────────────────────── */

export type Period = "mattina" | "pomeriggio" | "sera" | "notte";

export function periodOf(minutes: number): Period {
  if (minutes >= 5 * 60 && minutes < 12 * 60) return "mattina";
  if (minutes >= 12 * 60 && minutes < 17 * 60) return "pomeriggio";
  if (minutes >= 17 * 60 && minutes < 22 * 60) return "sera";
  return "notte";
}

export type WeekFacts = {
  focusMin: number;
  sessions: number;
  sessionsToPlan: number;
  pausedMin: number;
  byPeriod: Record<Period, number>;
  byWeekday: number[];
  bestPeriod: Period | null;
  distractions: [string, number][];
  tasksDone: Task[];
  importantDone: number;
  tasksDoneByDomain: Map<string, number>;
  focusByDomain: Map<string, number>;
  goalsAchieved: Goal[];
  goalsMissed: Goal[];
  milestonesDone: { goal: Goal; title: string }[];
  measurements: number;
  sleepAvg: number | null;
  shortNights: number;
  recoveryDays: number;
  overdueOpen: Task[];
};

export function weekFacts(i: ScoreInput & { goals: Goal[] }): WeekFacts {
  const end = i.to > i.today ? i.today : i.to;
  const inWeek = (date: string) => date >= i.from && date <= end;
  const sessions = i.sessions.filter((s) => inWeek(s.date));
  const byPeriod: Record<Period, number> = { mattina: 0, pomeriggio: 0, sera: 0, notte: 0 };
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const dist = new Map<string, number>();
  const focusByDomain = new Map<string, number>();
  for (const s of sessions) {
    const m = s.actualSec / 60;
    byPeriod[periodOf(minutesOfDay(s.startedAt, i.tz))] += m;
    byWeekday[weekday(s.date)] += m;
    if (s.domain) focusByDomain.set(s.domain, (focusByDomain.get(s.domain) ?? 0) + m);
    for (const d of s.distractions) {
      const k = d.note.trim().toLowerCase() || "non specificata";
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
  }
  const bestPeriod = (Object.entries(byPeriod) as [Period, number][]).sort((a, b) => b[1] - a[1])[0];
  const tasksDone = i.tasks.filter((t) => t.status === "done" && t.completedAt && inWeek(dateOfMs(t.completedAt, i.tz)));
  const tasksDoneByDomain = new Map<string, number>();
  for (const t of tasksDone) tasksDoneByDomain.set(t.domain, (tasksDoneByDomain.get(t.domain) ?? 0) + 1);
  const changedInWeek = (g: Goal) => inWeek(dateOfMs(g.updatedAt, i.tz));
  const milestonesDone = i.goals.flatMap((g) => g.milestones.filter((m) => m.doneAt && inWeek(dateOfMs(m.doneAt, i.tz))).map((m) => ({ goal: g, title: m.title })));
  const nights = i.sleeps.filter((s) => inWeek(s.date)).map((s) => sleepMinutes(s.bedTime, s.wakeTime));
  const days = end >= i.from ? dateRange(i.from, end) : [];
  return {
    focusMin: sessions.reduce((a, s) => a + s.actualSec / 60, 0),
    sessions: sessions.length,
    sessionsToPlan: sessions.filter((s) => s.outcome === "completed").length,
    pausedMin: sessions.reduce((a, s) => a + s.pausedSec / 60, 0),
    byPeriod,
    byWeekday,
    bestPeriod: bestPeriod && bestPeriod[1] > 0 ? bestPeriod[0] : null,
    distractions: [...dist.entries()].sort((a, b) => b[1] - a[1]),
    tasksDone,
    importantDone: tasksDone.filter((t) => t.important).length,
    tasksDoneByDomain,
    focusByDomain,
    goalsAchieved: i.goals.filter((g) => g.status === "achieved" && changedInWeek(g)),
    goalsMissed: i.goals.filter((g) => g.status === "missed" && changedInWeek(g)),
    milestonesDone,
    measurements: i.goals.reduce((a, g) => a + g.checkins.filter((c) => inWeek(c.date)).length, 0),
    sleepAvg: nights.length ? nights.reduce((a, b) => a + b, 0) / nights.length : null,
    shortNights: nights.filter((n) => n < SLEEP_OK_MIN).length,
    recoveryDays: days.filter((d) => i.modeOf(d) === "recovery").length,
    overdueOpen: i.tasks.filter((t) => t.status !== "done" && t.dueDate != null && t.dueDate <= end && t.dueDate >= i.from),
  };
}

/* ───────────────────────── Suggestions ───────────────────────── */

export type Suggestion = { text: string; because: string };

const PERIOD_LABEL: Record<Period, string> = { mattina: "la mattina", pomeriggio: "il pomeriggio", sera: "la sera", notte: "la notte" };

/** Rule-based recommendations. Each one states the observation that triggered it. */
export function suggestions(s: WeekScore, f: WeekFacts, ctx: { upcomingExams: DomainRecord[]; plannedExamIds: Set<string>; activeHabitCount: number }): Suggestion[] {
  const out: Suggestion[] = [];
  const val = (id: ScoreComponent["id"]) => s.components.find((c) => c.id === id)!.value;
  const cons = val("consistency");
  if (cons != null && cons < 0.6) {
    out.push(
      ctx.activeHabitCount > 5
        ? { text: "Riduci le abitudini previste: rendine alcune facoltative finché le essenziali non diventano automatiche.", because: `Costanza ${Math.round(cons * 100)}% con ${ctx.activeHabitCount} abitudini attive.` }
        : { text: "Abbina ogni abitudine a un momento fisso della giornata (dopo una preghiera, dopo la scuola).", because: `Costanza ${Math.round(cons * 100)}%.` },
    );
  }
  const pri = val("priorities");
  if (pri != null && pri < 0.5) out.push({ text: "Fissa meno attività nella Missione, o più piccole e concrete.", because: `Solo il ${Math.round(pri * 100)}% della Missione è stato completato.` });
  if (f.shortNights >= 3) out.push({ text: "Anticipa l'ora di andare a letto di 30 minuti e proteggila nel planner.", because: `${f.shortNights} notti sotto le 8 ore.` });
  const top = f.distractions[0];
  if (top && top[1] >= 3) out.push({ text: `Prepara l'ambiente prima di iniziare: la distrazione più frequente è "${top[0]}".`, because: `Annotata ${top[1]} volte durante le sessioni.` });
  if (f.bestPeriod && f.focusMin >= 60) out.push({ text: `Programma il lavoro profondo ${PERIOD_LABEL[f.bestPeriod]}, quando sei più produttivo.`, because: `${Math.round(f.byPeriod[f.bestPeriod])} min di focus in quella fascia questa settimana.` });
  const unplanned = ctx.upcomingExams.filter((e) => !ctx.plannedExamIds.has(e.id));
  if (unplanned.length) out.push({ text: `Crea un piano di ripasso per "${String(unplanned[0].data.title)}".`, because: `Esame il ${unplanned[0].date} senza piano di preparazione.` });
  if (f.overdueOpen.length) out.push({ text: "Decidi per ogni attività scaduta: falla, ripianificala o eliminala.", because: `${f.overdueOpen.length} attività con scadenza in questa settimana ancora aperte.` });
  if (!out.length && s.score != null) out.push({ text: "Mantieni il sistema così com'è: nessun cambiamento necessario.", because: "Nessun segnale critico nei dati della settimana." });
  return out;
}

/** Weeks (start dates) ending with the week containing `today`. */
export function lastWeeks(today: string, weekStart: 0 | 1, n: number, startOfWeek: (d: string, ws: 0 | 1) => string): string[] {
  const cur = startOfWeek(today, weekStart);
  return Array.from({ length: n }, (_, k) => addDays(cur, -(n - 1 - k) * 7));
}

export function daysLeftInWeek(weekStartDate: string, today: string) {
  return Math.max(0, 6 - daysBetween(weekStartDate, today));
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}
