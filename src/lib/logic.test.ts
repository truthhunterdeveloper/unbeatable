import { describe, expect, it } from "vitest";
import type { Habit, HabitLog, PlannerEvent, Task } from "@/db/schema";
import { buildTask } from "@/db/repo";
import { addDays, dateOfMs, dateRange, formatClock, sleepMinutes, startOfWeek, weekday } from "./date";
import { dayCompletion, dayState, habitStats, logsByHabit, modeLookup } from "./habits";
import { findConflicts, layoutColumns, occurrencesOn, sleepIntrusions, unionMinutes, workload } from "./planner";
import { extend, finishEarly, focusedMs, pause, pausedTotalMs, resume, startFocus, tick, toSession } from "./focus";
import { missionTasks, suggestMission } from "./mission";

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Habit",
  description: "",
  domain: "personal",
  frequency: { type: "daily" },
  target: 1,
  unit: "",
  estimateMin: null,
  tier: "standard",
  reminderTime: null,
  notes: "",
  archived: false,
  startDate: "2026-11-01",
  order: 1,
  createdAt: 0,
  ...over,
});

const log = (date: string, value = 1, excused: HabitLog["excused"] = null, habitId = "h1"): HabitLog => ({
  id: `${habitId}:${date}`,
  habitId,
  date,
  value,
  excused,
  updatedAt: 0,
});

const standard = modeLookup([]);

describe("date utilities", () => {
  it("does calendar arithmetic without DST drift", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekday("2026-11-14")).toBe(6); // Saturday
    expect(startOfWeek("2026-11-14", 1)).toBe("2026-11-09");
    expect(startOfWeek("2026-11-14", 0)).toBe("2026-11-08");
    expect(dateRange("2026-11-01", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
  it("resolves dates in a time zone", () => {
    const ms = Date.UTC(2026, 10, 14, 23, 30); // 23:30 UTC
    expect(dateOfMs(ms, "UTC")).toBe("2026-11-14");
    expect(dateOfMs(ms, "Asia/Dubai")).toBe("2026-11-15");
  });
  it("computes sleep across midnight", () => {
    expect(sleepMinutes("22:00", "06:30")).toBe(510);
    expect(sleepMinutes("00:30", "07:00")).toBe(390);
  });
  it("formats clocks", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(3_600_000 + 61_000)).toBe("1:01:01");
  });
});

describe("habit engine", () => {
  const today = "2026-11-10";

  it("counts consistency as a rate, and a single miss doesn't erase it", () => {
    const logs = new Map(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"].map((d) => [d, log(d)]));
    const s = habitStats(habit(), logs, "2026-11-01", today, today, standard);
    // 9 expected past days (today excluded until done), 8 done
    expect(s.expected).toBe(9);
    expect(s.rate).toBeCloseTo(8 / 9);
    expect(s.missed).toEqual(["2026-11-04"]);
    expect(s.currentStreak).toBe(5);
    expect(s.bestStreak).toBe(5);
    expect(s.misses).toBe(1);
    expect(s.recoveries).toBe(1);
  });

  it("doesn't judge today until it's done", () => {
    const s1 = habitStats(habit(), new Map(), today, today, today, standard);
    expect(s1.expected).toBe(0);
    expect(s1.rate).toBeNull();
    const s2 = habitStats(habit(), new Map([[today, log(today)]]), today, today, today, standard);
    expect(s2.rate).toBe(1);
  });

  it("gives partial credit toward a target", () => {
    const h = habit({ target: 5 });
    const s = habitStats(h, new Map([["2026-11-09", log("2026-11-09", 3)]]), "2026-11-09", "2026-11-09", today, standard);
    expect(s.credit).toBeCloseTo(0.6);
  });

  it("removes excused days from the denominator and keeps the streak", () => {
    const logs = new Map([
      ["2026-11-07", log("2026-11-07")],
      ["2026-11-08", log("2026-11-08", 0, "illness")],
      ["2026-11-09", log("2026-11-09")],
    ]);
    const s = habitStats(habit({ startDate: "2026-11-07" }), logs, "2026-11-07", today, today, standard);
    expect(s.expected).toBe(2);
    expect(s.rate).toBe(1);
    expect(s.excusedDays).toBe(1);
    expect(s.currentStreak).toBe(2);
  });

  it("only expects essential habits in recovery mode", () => {
    const modeOf = modeLookup([{ date: "2026-11-08", mode: "recovery", updatedAt: 0 }, { date: "2026-11-10", mode: "standard", updatedAt: 0 }]);
    const h = habit({ startDate: "2026-11-08" });
    const s = habitStats(h, new Map(), "2026-11-08", today, today, modeOf);
    expect(s.expected).toBe(0); // 8th and 9th were recovery days; today not over
    expect(dayState(h, "2026-11-09", undefined, "recovery", today)).toBe("not-required");
    const essential = habitStats({ ...h, tier: "essential" }, new Map(), "2026-11-08", today, today, modeOf);
    expect(essential.expected).toBe(2);
  });

  it("never counts optional habits as missed", () => {
    const s = habitStats(habit({ tier: "optional" }), new Map(), "2026-11-01", today, today, standard);
    expect(s.expected).toBe(0);
    expect(s.missed).toEqual([]);
  });

  it("respects specific weekdays", () => {
    // Mon/Wed/Fri only; Nov 2 2026 is a Monday
    const h = habit({ frequency: { type: "days", days: [1, 3, 5] } });
    const s = habitStats(h, new Map([["2026-11-02", log("2026-11-02")]]), "2026-11-02", "2026-11-08", today, standard);
    expect(s.expected).toBe(3);
    expect(s.missed).toEqual(["2026-11-04", "2026-11-06"]);
  });

  it("scores weekly quotas per week", () => {
    const h = habit({ frequency: { type: "weekly", timesPerWeek: 3 }, startDate: "2026-11-02" });
    const logs = new Map(["2026-11-02", "2026-11-04", "2026-11-06"].map((d) => [d, log(d)]));
    const s = habitStats(h, logs, "2026-11-02", "2026-11-08", "2026-11-09", standard);
    expect(s.expected).toBe(3);
    expect(s.rate).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.streakUnit).toBe("week");
  });

  it("computes daily completion across habits", () => {
    const a = habit({ id: "a" });
    const b = habit({ id: "b" });
    const c = habit({ id: "c", tier: "optional" });
    const byHabit = logsByHabit([log(today, 1, null, "a"), log(today, 1, null, "c")]);
    const r = dayCompletion([a, b, c], byHabit, today, standard);
    expect(r.expected).toBe(2);
    expect(r.credit).toBe(1);
    expect(r.bonus).toBe(1);
  });
});

const ev = (over: Partial<PlannerEvent>): PlannerEvent => ({
  id: "e",
  title: "Block",
  category: "other",
  start: "09:00",
  end: "10:00",
  date: "2026-11-09",
  repeatDays: [],
  until: null,
  skipDates: [],
  taskId: null,
  notes: "",
  createdAt: 0,
  ...over,
});

describe("planning engine", () => {
  it("expands recurring events and honours skipped dates", () => {
    const school = ev({ id: "school", repeatDays: [1, 2, 3, 4, 5], skipDates: ["2026-11-11"] });
    expect(occurrencesOn([school], "2026-11-10")).toHaveLength(1);
    expect(occurrencesOn([school], "2026-11-11")).toHaveLength(0); // skipped
    expect(occurrencesOn([school], "2026-11-14")).toHaveLength(0); // Saturday
    expect(occurrencesOn([school], "2026-11-02")).toHaveLength(0); // before start
    const until = ev({ id: "u", repeatDays: [1], until: "2026-11-16" });
    expect(occurrencesOn([until], "2026-11-23")).toHaveLength(0);
  });

  it("detects conflicts and lays them out side by side", () => {
    const occ = occurrencesOn(
      [ev({ id: "a", start: "09:00", end: "10:30" }), ev({ id: "b", start: "10:00", end: "11:00" }), ev({ id: "c", start: "11:00", end: "12:00" })],
      "2026-11-09",
    );
    const { pairs, keys } = findConflicts(occ);
    expect(pairs).toHaveLength(1);
    expect([...keys].sort()).toEqual(["a@2026-11-09", "b@2026-11-09"]);
    const layout = layoutColumns(occ);
    expect(layout.get("a@2026-11-09")).toEqual({ col: 0, cols: 2 });
    expect(layout.get("b@2026-11-09")).toEqual({ col: 1, cols: 2 });
    expect(layout.get("c@2026-11-09")).toEqual({ col: 0, cols: 1 });
  });

  it("flags blocks that cut into sleep", () => {
    const occ = occurrencesOn([ev({ id: "late", start: "21:30", end: "23:00" }), ev({ id: "ok", start: "08:00", end: "09:00" })], "2026-11-09");
    expect(sleepIntrusions(occ, "06:30", "22:00").map((o) => o.event.id)).toEqual(["late"]);
    expect(sleepIntrusions(occ, "06:30", "00:30")).toHaveLength(0);
  });

  it("counts overlapping time once and adds remaining task estimates", () => {
    expect(unionMinutes([{ start: 0, end: 60 }, { start: 30, end: 90 }, { start: 120, end: 150 }])).toBe(120);
    const occ = occurrencesOn([ev({ id: "s", start: "08:00", end: "15:00", category: "school" })], "2026-11-09");
    const t = buildTask({ title: "Essay", estimateMin: 90, actualMin: 30, scheduledDate: "2026-11-09" });
    const w = workload(occ, [t], "06:30", "22:00");
    expect(w.awakeMin).toBe(930);
    expect(w.committedMin).toBe(420);
    expect(w.taskMin).toBe(60);
    expect(w.level).toBe("balanced");
    expect(w.hasMeals).toBe(false);
  });
});

describe("focus timer", () => {
  const base = { id: "f", taskId: "t", label: "Maths", domain: "school", kind: "pomodoro" as const, plannedMin: 25, breakMin: 5 };

  it("counts only running time as focus and tracks paused time separately", () => {
    let a = startFocus(base, 0);
    a = pause(a, 10 * 60_000);
    expect(focusedMs(a, 15 * 60_000)).toBe(10 * 60_000);
    a = resume(a, 15 * 60_000);
    expect(pausedTotalMs(a, 16 * 60_000)).toBe(5 * 60_000);
    a = finishEarly(a, 20 * 60_000);
    expect(a.phase).toBe("review");
    expect(a.reachedTarget).toBe(false);
    const s = toSession(a, "2026-11-14", "  notes ", 4);
    expect(s.actualSec).toBe(15 * 60);
    expect(s.pausedSec).toBe(5 * 60);
    expect(s.outcome).toBe("ended_early");
    expect(s.notes).toBe("notes");
  });

  it("completes at the planned time even if the tab was asleep", () => {
    let a = startFocus(base, 0);
    a = tick(a, 60 * 60_000); // an hour later
    expect(a.phase).toBe("review");
    expect(a.reachedTarget).toBe(true);
    expect(a.endedAt).toBe(25 * 60_000);
    expect(toSession(a, "2026-11-14", "", null).actualSec).toBe(25 * 60);
  });

  it("can extend past the plan", () => {
    let a = tick(startFocus(base, 0), 25 * 60_000);
    a = extend(a, 10, 26 * 60_000);
    expect(a.phase).toBe("focus");
    expect(a.plannedMin).toBe(35);
    expect(focusedMs(a, 31 * 60_000)).toBe(30 * 60_000);
  });
});

describe("today's mission", () => {
  const today = "2026-11-14";
  it("suggests by transparent score and excludes optional work in intense mode", () => {
    const tasks: Task[] = [
      buildTask({ title: "Low", priority: 3 }),
      buildTask({ title: "Overdue essay", important: true, dueDate: "2026-11-12" }),
      buildTask({ title: "Optional", optional: true, priority: 1, urgent: true, dueDate: today }),
      buildTask({ title: "Pinned", missionDate: today }),
      buildTask({ title: "Done", important: true, status: "done" }),
    ];
    const std = suggestMission(tasks, today, "standard");
    expect(std[0].task.title).toBe("Overdue essay");
    expect(std[0].reasons).toContain("In ritardo");
    expect(std.map((s) => s.task.title)).not.toContain("Pinned");
    expect(std.map((s) => s.task.title)).not.toContain("Done");
    expect(suggestMission(tasks, today, "intense").map((s) => s.task.title)).not.toContain("Optional");
    expect(missionTasks(tasks, today).map((t) => t.title)).toEqual(["Pinned"]);
  });
});
