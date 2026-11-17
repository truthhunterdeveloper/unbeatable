import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { defaultSettings } from "./defaults";
import {
  ValidationError,
  createEvent,
  createHabit,
  createTask,
  deleteAllData,
  deleteTask,
  excuseHabit,
  exportAll,
  importAll,
  pinToMission,
  restoreTask,
  saveFocusSession,
  saveSettings,
  setHabitValue,
  setMode,
  skipOccurrence,
  toggleTaskDone,
  updateTask,
} from "./repo";

beforeEach(async () => {
  await deleteAllData();
});

describe("repository", () => {
  it("validates tasks before writing", async () => {
    await expect(createTask({ title: "   " })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTask({ title: "x", important: true, optional: true })).rejects.toMatchObject({
      fieldErrors: { optional: expect.any(String) },
    });
    const t = await createTask({ title: "  Revise algebra  ", estimateMin: 45 });
    expect(t.title).toBe("Revise algebra");
    expect(await db.tasks.count()).toBe(1);
  });

  it("completes, reopens and tracks completion time", async () => {
    const t = await createTask({ title: "Essay" });
    const done = await toggleTaskDone(t.id);
    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();
    const reopened = await toggleTaskDone(t.id);
    expect(reopened.status).toBe("todo");
    expect(reopened.completedAt).toBeNull();
  });

  it("caps Today's Mission at three tasks", async () => {
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push((await createTask({ title: `T${i}` })).id);
    for (let i = 0; i < 3; i++) await pinToMission(ids[i], "2026-11-14");
    await expect(pinToMission(ids[3], "2026-11-14")).rejects.toThrow(/tre attività/);
    // Re-saving an already pinned task is fine
    await expect(updateTask(ids[0], { notes: "ok" })).resolves.toBeTruthy();
  });

  it("deletes with undo, unlinking planner blocks", async () => {
    const t = await createTask({ title: "Linked" });
    const e = await createEvent({ title: "Work", category: "study", start: "16:00", end: "17:00", date: "2026-11-14", taskId: t.id });
    const snap = await deleteTask(t.id);
    expect((await db.events.get(e.id))?.taskId).toBeNull();
    await restoreTask(snap!);
    expect(await db.tasks.get(t.id)).toBeTruthy();
    expect((await db.events.get(e.id))?.taskId).toBe(t.id);
  });

  it("rejects planner blocks that end before they start", async () => {
    await expect(createEvent({ title: "Bad", category: "other", start: "10:00", end: "09:00", date: "2026-11-14" })).rejects.toMatchObject({
      fieldErrors: { end: expect.any(String) },
    });
  });

  it("skips a single occurrence of a recurring block", async () => {
    const e = await createEvent({ title: "School", category: "school", start: "08:30", end: "15:30", date: "2026-11-09", repeatDays: [1, 2, 3, 4, 5] });
    await skipOccurrence(e.id, "2026-11-11");
    expect((await db.events.get(e.id))?.skipDates).toEqual(["2026-11-11"]);
  });

  it("logs habit values and excuses", async () => {
    const h = await createHabit({ name: "Read", startDate: "2026-11-01", target: 10, unit: "pages" });
    await setHabitValue(h, "2026-11-14", 4);
    expect((await db.habitLogs.get(`${h.id}:2026-11-14`))?.value).toBe(4);
    await setHabitValue(h, "2026-11-14", 0);
    expect(await db.habitLogs.get(`${h.id}:2026-11-14`)).toBeUndefined();
    await excuseHabit(h.id, "2026-11-13", "illness");
    expect((await db.habitLogs.get(`${h.id}:2026-11-13`))?.excused).toBe("illness");
  });

  it("credits actual focus minutes, not planned minutes, to the task", async () => {
    const t = await createTask({ title: "Physics", estimateMin: 60 });
    await saveFocusSession({
      id: "s1",
      date: "2026-11-14",
      taskId: t.id,
      label: "Physics",
      domain: "school",
      kind: "pomodoro",
      plannedMin: 25,
      actualSec: 14 * 60 + 20,
      pausedSec: 120,
      outcome: "ended_early",
      distractions: [{ at: 1, note: "phone" }],
      notes: "",
      quality: 3,
      startedAt: 0,
      endedAt: 1000,
    });
    const after = await db.tasks.get(t.id);
    expect(after?.actualMin).toBe(14);
    expect(after?.status).toBe("in_progress");
  });

  it("records the mode per day", async () => {
    await saveSettings({ ...defaultSettings(), name: "Test", onboardedAt: 1 });
    await setMode("recovery", "2026-11-14");
    expect((await db.settings.get("settings"))?.mode).toBe("recovery");
    expect((await db.dayMeta.get("2026-11-14"))?.mode).toBe("recovery");
  });

  it("exports and re-imports everything, rejecting foreign files", async () => {
    await saveSettings({ ...defaultSettings(), name: "Test", onboardedAt: 1 });
    await createTask({ title: "Keep me" });
    const file = JSON.parse(JSON.stringify(await exportAll()));
    await deleteAllData();
    expect(await db.tasks.count()).toBe(0);
    const { counts } = await importAll(file);
    expect(counts.tasks).toBe(1);
    expect((await db.tasks.toArray())[0].title).toBe("Keep me");
    await expect(importAll({ hello: "world" })).rejects.toThrow(/non è un'esportazione/);
    file.data.tasks[0].priority = 9;
    await expect(importAll(file)).rejects.toThrow(/Record tasks non valido/);
    expect(await db.tasks.count()).toBe(1); // nothing was wiped by the failed import
  });
});
