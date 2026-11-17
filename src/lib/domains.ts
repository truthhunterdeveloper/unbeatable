/**
 * Phase 2 logic. Everything here is computed from recorded evidence only —
 * no estimates are presented as results.
 */
import type { DomainRecord, Goal, Task } from "@/db/schema";
import { addDays, dateRange, daysBetween, startOfWeek } from "./date";

/* ───────────────────────── Goals ───────────────────────── */

export type GoalProgress = {
  /** 0..1 from evidence, or null when there's no evidence yet. */
  progress: number | null;
  current: number | null;
  /** Share of the time window elapsed (0..1), null without a target date. */
  elapsed: number | null;
  pace: "ahead" | "on-track" | "behind" | null;
  tasksDone: number;
  tasksTotal: number;
  evidenceCount: number;
};

export function goalProgress(g: Goal, tasks: Task[], today: string): GoalProgress {
  let progress: number | null = null;
  let current: number | null = null;
  let evidenceCount = 0;
  if (g.kind === "quantitative") {
    evidenceCount = g.checkins.length;
    if (evidenceCount) {
      current = g.checkins[g.checkins.length - 1].value;
      progress = clamp01((current - g.baseline) / (g.target - g.baseline));
    }
  } else {
    evidenceCount = g.milestones.filter((m) => m.doneAt).length;
    if (g.milestones.length) progress = evidenceCount / g.milestones.length;
  }
  let elapsed: number | null = null;
  if (g.targetDate) {
    const span = daysBetween(g.startDate, g.targetDate);
    elapsed = span <= 0 ? 1 : clamp01(daysBetween(g.startDate, today) / span);
  }
  let pace: GoalProgress["pace"] = null;
  if (progress != null && elapsed != null && g.status === "active") {
    pace = progress >= elapsed + 0.1 ? "ahead" : progress >= elapsed - 0.1 ? "on-track" : "behind";
  }
  const linked = tasks.filter((t) => t.goalId === g.id);
  return { progress, current, elapsed, pace, tasksDone: linked.filter((t) => t.status === "done").length, tasksTotal: linked.length, evidenceCount };
}

export const GOAL_LEVELS = [
  { id: "vision", label: "Life vision", child: "annual" },
  { id: "annual", label: "Annual objective", child: "quarterly" },
  { id: "quarterly", label: "Quarterly goal", child: "monthly" },
  { id: "monthly", label: "Monthly milestone", child: "weekly" },
  { id: "weekly", label: "Weekly target", child: null },
] as const;

export function levelLabel(level: Goal["level"]) {
  return GOAL_LEVELS.find((l) => l.id === level)!.label;
}

export function childLevel(level: Goal["level"]): Goal["level"] | null {
  return GOAL_LEVELS.find((l) => l.id === level)!.child;
}

/* ───────────────────────── Football ───────────────────────── */

/** Session-RPE load (minutes × RPE), the standard way to quantify training load. */
export function sessionLoad(r: DomainRecord): number {
  const d = r.data;
  if (r.type === "training") return Number(d.duration ?? 0) * Number(d.rpe ?? 0);
  if (r.type === "match" && d.rpe && d.minutes) return Number(d.minutes) * Number(d.rpe);
  return 0;
}

export type LoadSummary = {
  weeks: { weekStart: string; load: number; sessions: number }[];
  acute: number; // last 7 days
  chronic: number | null; // average weekly load over the 4 weeks before, if there's enough history
  ratio: number | null;
  restDays: number; // in the last 7 days
  flag: "spike" | "low" | "steady" | null;
};

export function footballLoad(records: DomainRecord[], today: string, weeks = 8): LoadSummary {
  const relevant = records.filter((r) => r.type === "training" || r.type === "match");
  const firstWeek = addDays(startOfWeek(today, 1), -(weeks - 1) * 7);
  const out: LoadSummary["weeks"] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(firstWeek, i * 7);
    const we = addDays(ws, 6);
    const rs = relevant.filter((r) => r.date >= ws && r.date <= we);
    out.push({ weekStart: ws, load: rs.reduce((a, r) => a + sessionLoad(r), 0), sessions: rs.length });
  }
  const last7 = dateRange(addDays(today, -6), today);
  const acute = relevant.filter((r) => r.date >= last7[0] && r.date <= today).reduce((a, r) => a + sessionLoad(r), 0);
  const prior = relevant.filter((r) => r.date >= addDays(today, -34) && r.date <= addDays(today, -7));
  const earliest = relevant.reduce<string | null>((m, r) => (m == null || r.date < m ? r.date : m), null);
  const enoughHistory = earliest != null && earliest <= addDays(today, -21);
  const chronic = enoughHistory ? prior.reduce((a, r) => a + sessionLoad(r), 0) / 4 : null;
  const ratio = chronic && chronic > 0 ? acute / chronic : null;
  // A rest day = no match and no training other than a recovery session.
  const activeDays = new Set(
    relevant.filter((r) => r.date >= last7[0] && r.date <= today && !(r.type === "training" && r.data.sessionType === "recovery")).map((r) => r.date),
  );
  const restDays = 7 - activeDays.size;
  const flag = ratio == null ? null : ratio > 1.5 ? "spike" : ratio < 0.6 ? "low" : "steady";
  return { weeks: out, acute, chronic, ratio, restDays, flag };
}

export function skillFocusCounts(records: DomainRecord[], from: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of records) {
    if (r.type !== "training" || r.date < from) continue;
    for (const f of (r.data.focus as string[] | undefined) ?? []) m.set(f, (m.get(f) ?? 0) + 1);
  }
  return m;
}

/* ───────────────────────── School ───────────────────────── */

export type SubjectPriority = { subject: DomainRecord; score: number; reasons: string[]; nextExam: DomainRecord | null; latestPct: number | null };

export function subjectPriorities(records: DomainRecord[], today: string): SubjectPriority[] {
  const subjects = records.filter((r) => r.type === "subject");
  return subjects
    .map((sub) => {
      const reasons: string[] = [];
      let score = 0;
      const base = sub.data.priority === "high" ? 3 : sub.data.priority === "low" ? 1 : 2;
      score += base;
      if (base === 3) reasons.push("Priorità alta");
      const diff = Number(sub.data.difficulty ?? 3);
      score += diff - 1;
      if (diff >= 4) reasons.push(`Difficoltà ${diff}/5`);
      const exams = records.filter((r) => r.type === "exam" && r.data.subjectId === sub.id && r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
      const nextExam = exams[0] ?? null;
      if (nextExam) {
        const d = daysBetween(today, nextExam.date);
        const bump = d <= 7 ? 4 : d <= 14 ? 3 : d <= 30 ? 2 : d <= 60 ? 1 : 0;
        score += bump;
        if (bump) reasons.push(d === 0 ? "Esame oggi" : `Esame tra ${d} gg`);
      }
      const grades = records.filter((r) => r.type === "grade" && r.data.subjectId === sub.id).sort((a, b) => (a.date < b.date ? -1 : 1));
      const g = grades[grades.length - 1];
      const latestPct = g ? Number(g.data.score) / Number(g.data.outOf) : null;
      if (latestPct != null && latestPct < 0.6) {
        score += 1;
        reasons.push(`Ultimo voto ${Math.round(latestPct * 100)}%`);
      }
      return { subject: sub, score, reasons, nextExam, latestPct };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Spreads revision topics across the days before an exam. The exam eve is kept
 * for a light full review; nothing is scheduled on the exam day itself.
 */
export function revisionPlan(topics: string[], today: string, examDate: string): { date: string; title: string }[] {
  const clean = topics.map((t) => t.trim()).filter(Boolean);
  const first = addDays(today, 1);
  const eve = addDays(examDate, -1);
  if (eve < first) return [];
  const studyDays = eve > first ? dateRange(first, addDays(eve, -1)) : [];
  const plan: { date: string; title: string }[] = [];
  if (studyDays.length) {
    clean.forEach((topic, i) => {
      const day = studyDays[Math.min(studyDays.length - 1, Math.floor((i * studyDays.length) / clean.length))];
      plan.push({ date: day, title: `Ripasso: ${topic}` });
    });
  } else {
    clean.forEach((topic) => plan.push({ date: eve, title: `Ripasso: ${topic}` }));
  }
  plan.push({ date: eve, title: "Ripasso leggero generale + a letto presto" });
  return plan;
}

/* ───────────────────────── Business ───────────────────────── */

export type BusinessMetrics = {
  activity: Map<string, number>;
  outcomes: Map<string, number>;
  /** Per currency — amounts in different currencies are never added together. */
  money: Map<string, { income: number; expense: number }>;
};

export function businessMetrics(records: DomainRecord[], from: string, to: string, projectId?: string): BusinessMetrics {
  const activity = new Map<string, number>();
  const outcomes = new Map<string, number>();
  const money = new Map<string, { income: number; expense: number }>();
  for (const r of records) {
    if (r.date < from || r.date > to) continue;
    if (projectId && r.data.projectId !== projectId) continue;
    const k = String(r.data.kind ?? "");
    if (r.type === "activity") activity.set(k, (activity.get(k) ?? 0) + Number(r.data.count ?? 0));
    else if (r.type === "outcome") outcomes.set(k, (outcomes.get(k) ?? 0) + Number(r.data.count ?? 0));
    else if (r.type === "transaction") {
      const cur = String(r.data.currency ?? "").toUpperCase();
      const m = money.get(cur) ?? { income: 0, expense: 0 };
      if (r.data.kind === "income") m.income += Number(r.data.amount);
      else m.expense += Number(r.data.amount);
      money.set(cur, m);
    }
  }
  return { activity, outcomes, money };
}

function clamp01(x: number) {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}
