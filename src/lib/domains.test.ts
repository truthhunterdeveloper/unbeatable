import { describe, expect, it } from "vitest";
import type { DomainRecord, Goal } from "@/db/schema";
import { buildTask } from "@/db/repo";
import { businessMetrics, footballLoad, goalProgress, revisionPlan, subjectPriorities } from "./domains";
import { dataSchema } from "@/db/records";

const rec = (type: string, date: string, data: Record<string, unknown>, id = `${type}-${date}-${Math.random()}`): DomainRecord => ({ id, type, date, data, createdAt: 0, updatedAt: 0 });

const goal = (over: Partial<Goal>): Goal => ({
  id: "g",
  title: "Maths",
  description: "",
  domain: "school",
  level: "quarterly",
  parentId: null,
  startDate: "2026-11-01",
  targetDate: "2026-12-01",
  outcome: "",
  kind: "quantitative",
  unit: "%",
  baseline: 50,
  target: 80,
  checkins: [],
  milestones: [],
  status: "active",
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe("goal progress comes only from evidence", () => {
  it("has no progress without check-ins", () => {
    expect(goalProgress(goal({}), [], "2026-11-15").progress).toBeNull();
  });
  it("uses the latest measurement against baseline and target", () => {
    const p = goalProgress(goal({ checkins: [{ date: "2026-11-05", value: 56, note: "" }, { date: "2026-11-14", value: 65, note: "" }] }), [], "2026-11-16");
    expect(p.current).toBe(65);
    expect(p.progress).toBeCloseTo(0.5);
    expect(p.elapsed).toBeCloseTo(0.5);
    expect(p.pace).toBe("on-track");
  });
  it("handles decreasing targets (e.g. a 5k time)", () => {
    const p = goalProgress(goal({ baseline: 25, target: 20, checkins: [{ date: "2026-11-10", value: 24, note: "" }] }), [], "2026-11-10");
    expect(p.progress).toBeCloseTo(0.2);
  });
  it("counts milestones for qualitative goals and reports linked tasks separately", () => {
    const g = goal({ kind: "qualitative", milestones: [{ id: "a", title: "A", doneAt: 1 }, { id: "b", title: "B", doneAt: null }] });
    const t = buildTask({ title: "x", goalId: "g", status: "done" });
    const p = goalProgress(g, [t, buildTask({ title: "y", goalId: "g" })], "2026-11-02");
    expect(p.progress).toBe(0.5);
    expect([p.tasksDone, p.tasksTotal]).toEqual([1, 2]);
  });
});

describe("football load", () => {
  it("computes session-RPE and flags spikes against the prior 4 weeks", () => {
    const rs: DomainRecord[] = [];
    for (let w = 1; w <= 4; w++) rs.push(rec("training", `2026-10-${String(10 + w * 3).padStart(2, "0")}`, { duration: 60, rpe: 5, sessionType: "team" }));
    rs.push(rec("training", "2026-11-12", { duration: 90, rpe: 8, sessionType: "team" }));
    rs.push(rec("match", "2026-11-14", { minutes: 90, rpe: 9 }));
    rs.push(rec("training", "2026-11-13", { duration: 30, rpe: 2, sessionType: "recovery" }));
    const l = footballLoad(rs, "2026-11-14");
    expect(l.acute).toBe(720 + 810 + 60);
    expect(l.chronic).toBe(300);
    expect(l.flag).toBe("spike");
    expect(l.restDays).toBe(5);
  });
  it("doesn't judge load without enough history", () => {
    expect(footballLoad([rec("training", "2026-11-14", { duration: 60, rpe: 6 })], "2026-11-14").ratio).toBeNull();
  });
});

describe("school", () => {
  it("ranks subjects transparently", () => {
    const maths = rec("subject", "2026-09-01", { name: "Maths", priority: "normal", difficulty: 4 }, "maths");
    const art = rec("subject", "2026-09-01", { name: "Art", priority: "normal", difficulty: 2 }, "art");
    const exam = rec("exam", "2026-11-20", { subjectId: "maths", title: "P1" });
    const grade = rec("grade", "2026-11-01", { subjectId: "maths", title: "Mock", score: 45, outOf: 100 });
    const r = subjectPriorities([maths, art, exam, grade], "2026-11-14");
    expect(r[0].subject.id).toBe("maths");
    expect(r[0].reasons).toEqual(["Difficoltà 4/5", "Esame tra 6 gg", "Ultimo voto 45%"]);
  });
  it("spreads revision before the exam and keeps the eve light", () => {
    const plan = revisionPlan(["A", "B", "C"], "2026-11-14", "2026-11-20");
    expect(plan.map((p) => p.date)).toEqual(["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-19"]);
    expect(plan.at(-1)!.title).toMatch(/Ripasso leggero/);
    expect(revisionPlan(["A"], "2026-11-14", "2026-11-15")).toEqual([]);
  });
});

describe("business", () => {
  it("separates activity from outcomes and never mixes currencies", () => {
    const rs = [
      rec("activity", "2026-11-10", { kind: "outreach", count: 10 }),
      rec("outcome", "2026-11-11", { kind: "meetingBooked", count: 2 }),
      rec("transaction", "2026-11-12", { kind: "income", amount: 20, currency: "eur" }),
      rec("transaction", "2026-11-12", { kind: "income", amount: 5, currency: "GBP" }),
      rec("transaction", "2026-11-13", { kind: "expense", amount: 4, currency: "EUR" }),
    ];
    const m = businessMetrics(rs, "2026-11-09", "2026-11-15");
    expect(m.activity.get("outreach")).toBe(10);
    expect(m.outcomes.get("meetingBooked")).toBe(2);
    expect(m.money.get("EUR")).toEqual({ income: 20, expense: 4 });
    expect(m.money.get("GBP")).toEqual({ income: 5, expense: 0 });
  });
});

describe("record schemas", () => {
  it("validates generated record data", () => {
    expect(dataSchema("training").safeParse({ sessionType: "team", duration: 60, rpe: 7, focus: ["weak-foot"] }).success).toBe(true);
    expect(dataSchema("training").safeParse({ sessionType: "team", duration: 60, rpe: 11 }).success).toBe(false);
    expect(dataSchema("transaction").safeParse({ kind: "income", amount: 0, currency: "EUR", description: "x" }).success).toBe(false);
    expect(dataSchema("grade").safeParse({ subjectId: "", title: "x", score: 1, outOf: 2 }).success).toBe(false);
  });
});
