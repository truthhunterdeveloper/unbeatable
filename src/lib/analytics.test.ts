import { describe, expect, it } from "vitest";
import type { FocusSession, Habit, SleepLog } from "@/db/schema";
import { buildTask } from "@/db/repo";
import { logsByHabit, modeLookup } from "./habits";
import { periodOf, suggestions, weekFacts, weekScore, type ScoreInput } from "./analytics";

const habit = (id: string, tier: Habit["tier"]): Habit => ({
  id, name: id, description: "", domain: "personal", frequency: { type: "daily" }, target: 1, unit: "", estimateMin: null, tier,
  reminderTime: null, notes: "", archived: false, startDate: "2026-11-01", order: 1, createdAt: 0,
});
const session = (date: string, min: number, extra: Partial<FocusSession> = {}): FocusSession => ({
  id: date + min, date, taskId: null, label: "x", domain: "school", kind: "pomodoro", plannedMin: min, actualSec: min * 60, pausedSec: 0,
  outcome: "completed", distractions: [], notes: "", quality: null, startedAt: Date.UTC(2026, 10, Number(date.slice(8)), 8), endedAt: 0, ...extra,
});
const sleep = (date: string, bed: string, wake: string): SleepLog => ({ date, bedTime: bed, wakeTime: wake, quality: null, updatedAt: 0 });

// Week Mon 9 – Sun 15 Nov 2026, evaluated on Sunday the 15th.
const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  from: "2026-11-09", to: "2026-11-15", today: "2026-11-15", tz: "UTC",
  habits: [], byHabit: new Map(), modeOf: modeLookup([]), tasks: [], sessions: [], sleeps: [], ...over,
});

describe("discipline score", () => {
  it("is null without any data instead of zero", () => {
    const s = weekScore(base());
    expect(s.score).toBeNull();
    expect(s.coveredWeight).toBe(0);
  });

  it("weights essential habits double and excludes missing components", () => {
    const ess = habit("e", "essential");
    const std = habit("s", "standard");
    const logs = [];
    for (let d = 9; d <= 15; d++) logs.push({ id: `e:${d}`, habitId: "e", date: `2026-11-${String(d).padStart(2, "0")}`, value: 1, excused: null, updatedAt: 0 });
    const s = weekScore(base({ habits: [ess, std], byHabit: logsByHabit(logs) }));
    // essential 7/7 ×2 = 14; standard 0/6 ×1 (today isn't judged until done) → 14 / 20
    expect(s.components[0].value).toBeCloseTo(14 / 20);
    expect(s.coveredWeight).toBe(35 + 15); // focus has eligible days, mission/sleep have no data
  });

  it("rewards focus regularity, capped at five days, not long hours", () => {
    const few = weekScore(base({ sessions: [session("2026-11-10", 300)] }));
    const regular = weekScore(base({ sessions: ["10", "11", "12", "13", "14"].map((d) => session(`2026-11-${d}`, 25)) }));
    expect(few.components[2].value).toBeCloseTo(1 / 5);
    expect(regular.components[2].value).toBe(1);
  });

  it("never penalises recovery mode days", () => {
    const modeOf = modeLookup([{ date: "2026-11-09", mode: "recovery", updatedAt: 0 }]);
    const t = buildTask({ title: "x", missionDate: "2026-11-10" });
    const s = weekScore(base({ modeOf, tasks: [t], habits: [habit("s", "standard")] }));
    expect(s.components[1].value).toBeNull(); // mission on a recovery day is excluded
    expect(s.components[2].value).toBeNull(); // no eligible focus days
    expect(s.components[0].value).toBeNull(); // standard habits aren't expected in recovery
  });

  it("scores sleep only on logged nights", () => {
    const s = weekScore(base({ sleeps: [sleep("2026-11-14", "22:00", "06:30"), sleep("2026-11-15", "00:30", "06:30")] }));
    expect(s.components[3].value).toBe(0.5);
  });

  it("combines components as a weighted average of available data", () => {
    const t1 = buildTask({ title: "a", missionDate: "2026-11-12", status: "done" });
    const t2 = buildTask({ title: "b", missionDate: "2026-11-12" });
    const s = weekScore(base({ tasks: [t1, t2], sleeps: [sleep("2026-11-14", "22:00", "06:30")] }));
    // priorities 0.5 ×25, focus 0 ×15, recovery 1 ×25 → (12.5 + 0 + 25) / 65
    expect(s.score).toBe(Math.round((100 * 37.5) / 65));
  });
});

describe("weekly facts and suggestions", () => {
  it("finds the most productive period and top distraction", () => {
    const ss = [
      session("2026-11-10", 50, { distractions: [{ at: 0, note: "Telefono" }, { at: 0, note: "telefono" }, { at: 0, note: "Telefono" }] }),
      session("2026-11-11", 40),
    ];
    const f = weekFacts({ ...base({ sessions: ss }), goals: [] });
    expect(f.bestPeriod).toBe("mattina");
    expect(f.distractions[0]).toEqual(["telefono", 3]);
    const sug = suggestions(weekScore(base({ sessions: ss })), f, { upcomingExams: [], plannedExamIds: new Set(), activeHabitCount: 0 });
    expect(sug.some((x) => x.text.includes("telefono"))).toBe(true);
    expect(sug.every((x) => x.because.length > 0)).toBe(true);
  });

  it("maps hours to periods", () => {
    expect(periodOf(7 * 60)).toBe("mattina");
    expect(periodOf(14 * 60)).toBe("pomeriggio");
    expect(periodOf(20 * 60)).toBe("sera");
    expect(periodOf(23 * 60)).toBe("notte");
  });
});
