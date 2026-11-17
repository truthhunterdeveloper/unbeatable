/**
 * Today's Mission: at most three high-impact tasks for the day.
 * The user decides what is pinned; the scoring only produces suggestions.
 */
import type { Mode, Task } from "@/db/schema";
import { daysBetween } from "./date";

export function missionTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((t) => t.missionDate === today)
    .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
}

export type Suggestion = { task: Task; score: number; reasons: string[] };

/** Transparent ranking. Each reason is shown to the user next to the suggestion. */
export function scoreTask(t: Task, today: string): Suggestion {
  let score = 0;
  const reasons: string[] = [];
  if (t.important) {
    score += 3;
    reasons.push("Importante");
  }
  if (t.urgent) {
    score += 2;
    reasons.push("Urgente");
  }
  if (t.priority === 1) score += 2;
  else if (t.priority === 2) score += 1;
  if (t.dueDate) {
    const d = daysBetween(today, t.dueDate);
    if (d < 0) {
      score += 3;
      reasons.push("In ritardo");
    } else if (d === 0) {
      score += 2;
      reasons.push("Scade oggi");
    } else if (d <= 3) {
      score += 1;
      reasons.push(`Scade tra ${d} gg`);
    }
  }
  if (t.scheduledDate === today) {
    score += 2;
    reasons.push("Pianificata per oggi");
  }
  if (t.missionDate && t.missionDate < today) {
    score += 2;
    reasons.push("Riportata da ieri");
  }
  if (t.optional) score -= 3;
  return { task: t, score, reasons };
}

export function suggestMission(tasks: Task[], today: string, mode: Mode, limit = 3): Suggestion[] {
  return tasks
    .filter((t) => t.status !== "done" && t.missionDate !== today)
    .filter((t) => (mode === "standard" ? true : !t.optional))
    .map((t) => scoreTask(t, today))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.task.createdAt - b.task.createdAt)
    .slice(0, limit);
}

export const MODE_COPY: Record<Mode, { label: string; short: string; description: string; missionHint: string }> = {
  standard: {
    label: "Standard",
    short: "Standard",
    description: "Scuola, allenamenti, responsabilità e crescita a un ritmo sostenibile.",
    missionHint: "Tre attività che fanno davvero la differenza oggi.",
  },
  intense: {
    label: "Alta intensità",
    short: "Intensa",
    description: "Meno priorità, esecuzione deliberata. Sonno, preghiera e recupero restano protetti.",
    missionHint: "Meno cose, più impegnative. Il facoltativo è nascosto — l'ora di dormire non si tocca.",
  },
  recovery: {
    label: "Recupero",
    short: "Recupero",
    description: "Malattia, infortunio o settimana pesante. Solo l'essenziale. Il riposo fa parte del piano.",
    missionHint: "Oggi basta un'attività significativa. Solo l'essenziale.",
  },
};
