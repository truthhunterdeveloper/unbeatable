/**
 * Repository layer. All writes go through here so that every record is
 * validated with Zod before it reaches IndexedDB.
 */
import { z } from "zod";
import { db, TABLES, type TableName } from "./db";
import {
  ActiveFocusSchema,
  DayMetaSchema,
  EventSchema,
  FocusSessionSchema,
  HabitLogSchema,
  HabitSchema,
  KvSchema,
  SettingsSchema,
  SleepLogSchema,
  TaskSchema,
  GoalSchema,
  RecordSchema,
  goalRuleErrors,
  eventRuleErrors,
  taskRuleErrors,
  type ActiveFocus,
  type Excuse,
  type FocusSession,
  type Habit,
  type HabitLog,
  type Mode,
  type PlannerEvent,
  type Settings,
  type SleepLog,
  type Task,
  type TaskStatus,
  type Goal,
  type DomainRecord,
} from "./schema";
import { dataSchema } from "./records";

export const MAX_MISSION = 3;

export class ValidationError extends Error {
  fieldErrors: Record<string, string>;
  constructor(fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] ?? "Dati non validi");
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export function validate<T>(schema: z.ZodType<T>, value: unknown, extra: Record<string, string> = {}): T {
  const result = schema.safeParse(value);
  const errors: Record<string, string> = { ...extra };
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  if (Object.keys(errors).length || !result.success) throw new ValidationError(errors);
  return result.data;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ───────────────────────── Settings & modes ───────────────────────── */

export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get("settings");
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const s = validate(SettingsSchema, settings);
  await db.settings.put(s);
  return s;
}

export async function setMode(mode: Mode, today: string): Promise<void> {
  await db.transaction("rw", db.settings, db.dayMeta, async () => {
    const s = await db.settings.get("settings");
    if (!s) throw new Error("Impostazioni non trovate");
    await db.settings.put(validate(SettingsSchema, { ...s, mode }));
    await db.dayMeta.put(validate(DayMetaSchema, { date: today, mode, updatedAt: Date.now() }));
  });
}

/** Records which mode was active today, so history is judged against the right expectations. */
export async function ensureDayMeta(today: string, mode: Mode): Promise<void> {
  const existing = await db.dayMeta.get(today);
  if (!existing) await db.dayMeta.put({ date: today, mode, updatedAt: Date.now() });
}

/* ───────────────────────── Tasks ───────────────────────── */

export type TaskInput = Partial<Omit<Task, "id" | "createdAt" | "updatedAt">> & { title: string };

export function buildTask(input: TaskInput, now = Date.now()): Task {
  return {
    id: uid(),
    description: "",
    priority: 2,
    important: false,
    urgent: false,
    optional: false,
    domain: "personal",
    dueDate: null,
    scheduledDate: null,
    estimateMin: null,
    actualMin: 0,
    status: "todo",
    missionDate: null,
    goalId: null,
    projectId: null,
    notes: "",
    completedAt: null,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createTask(input: TaskInput): Promise<Task> {
  const draft = buildTask(input);
  const task = validate(TaskSchema, draft, taskRuleErrors(draft));
  if (task.missionDate) await assertMissionRoom(task.missionDate, task.id);
  await db.tasks.add(task);
  return task;
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task> {
  const current = await db.tasks.get(id);
  if (!current) throw new Error("Questa attività non esiste più");
  const next: Task = { ...current, ...patch, id, updatedAt: Date.now() };
  if (patch.status && patch.status !== current.status) {
    next.completedAt = patch.status === "done" ? Date.now() : null;
  }
  const task = validate(TaskSchema, next, taskRuleErrors(next));
  if (task.missionDate && task.missionDate !== current.missionDate) await assertMissionRoom(task.missionDate, id);
  await db.tasks.put(task);
  return task;
}

export function setTaskStatus(id: string, status: TaskStatus) {
  return updateTask(id, { status });
}

export async function toggleTaskDone(id: string): Promise<Task> {
  const t = await db.tasks.get(id);
  if (!t) throw new Error("Questa attività non esiste più");
  return updateTask(id, { status: t.status === "done" ? "todo" : "done" });
}

export async function deleteTask(id: string): Promise<{ task: Task; linkedEventIds: string[] } | undefined> {
  return db.transaction("rw", db.tasks, db.events, async () => {
    const task = await db.tasks.get(id);
    if (!task) return undefined;
    const linked = await db.events.filter((e) => e.taskId === id).toArray();
    for (const e of linked) await db.events.put({ ...e, taskId: null });
    await db.tasks.delete(id);
    return { task, linkedEventIds: linked.map((e) => e.id) };
  });
}

export async function restoreTask(snapshot: { task: Task; linkedEventIds: string[] }): Promise<void> {
  await db.transaction("rw", db.tasks, db.events, async () => {
    await db.tasks.put(validate(TaskSchema, snapshot.task));
    for (const eid of snapshot.linkedEventIds) {
      const e = await db.events.get(eid);
      if (e) await db.events.put({ ...e, taskId: snapshot.task.id });
    }
  });
}

async function assertMissionRoom(date: string, exceptId: string) {
  const count = await db.tasks.where("missionDate").equals(date).filter((t) => t.id !== exceptId).count();
  if (count >= MAX_MISSION) {
    throw new Error("La Missione di oggi contiene al massimo tre attività. Rimuovine una prima di aggiungerne un'altra.");
  }
}

export async function pinToMission(id: string, date: string): Promise<Task> {
  return updateTask(id, { missionDate: date, scheduledDate: date });
}

export async function unpinMission(id: string): Promise<Task> {
  return updateTask(id, { missionDate: null });
}

/* ───────────────────────── Habits ───────────────────────── */

export type HabitInput = Partial<Omit<Habit, "id" | "createdAt" | "order">> & Pick<Habit, "name" | "startDate">;

export async function createHabit(input: HabitInput): Promise<Habit> {
  const last = await db.habits.orderBy("order").last();
  const habit = validate(HabitSchema, {
    id: uid(),
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
    ...input,
    order: (last?.order ?? 0) + 1,
    createdAt: Date.now(),
  });
  await db.habits.add(habit);
  return habit;
}

export async function updateHabit(id: string, patch: Partial<Habit>): Promise<Habit> {
  const current = await db.habits.get(id);
  if (!current) throw new Error("Questa abitudine non esiste più");
  const habit = validate(HabitSchema, { ...current, ...patch, id });
  await db.habits.put(habit);
  return habit;
}

export function archiveHabit(id: string, archived: boolean) {
  return updateHabit(id, { archived });
}

export async function deleteHabit(id: string): Promise<void> {
  await db.transaction("rw", db.habits, db.habitLogs, async () => {
    await db.habitLogs.where("habitId").equals(id).delete();
    await db.habits.delete(id);
  });
}

export const logId = (habitId: string, date: string) => `${habitId}:${date}`;

/** Sets the recorded amount for a day. Zero clears the entry. */
export async function setHabitValue(habit: Habit, date: string, value: number): Promise<void> {
  const v = Math.max(0, Math.min(Math.round(value), 1000));
  const key = logId(habit.id, date);
  if (v === 0) {
    await db.habitLogs.delete(key);
    return;
  }
  const log: HabitLog = validate(HabitLogSchema, { id: key, habitId: habit.id, date, value: v, excused: null, updatedAt: Date.now() });
  await db.habitLogs.put(log);
}

/** Marks a day as excused (rest, illness…). Excused days never count against consistency. */
export async function excuseHabit(habitId: string, date: string, reason: Excuse | null): Promise<void> {
  const key = logId(habitId, date);
  if (!reason) {
    await db.habitLogs.delete(key);
    return;
  }
  await db.habitLogs.put(validate(HabitLogSchema, { id: key, habitId, date, value: 0, excused: reason, updatedAt: Date.now() }));
}

/* ───────────────────────── Planner ───────────────────────── */

export type EventInput = Omit<PlannerEvent, "id" | "createdAt" | "skipDates" | "taskId" | "notes" | "until" | "repeatDays"> &
  Partial<Pick<PlannerEvent, "skipDates" | "taskId" | "notes" | "until" | "repeatDays">>;

export async function createEvent(input: EventInput): Promise<PlannerEvent> {
  const draft: PlannerEvent = {
    id: uid(),
    repeatDays: [],
    until: null,
    skipDates: [],
    taskId: null,
    notes: "",
    ...input,
    createdAt: Date.now(),
  };
  const ev = validate(EventSchema, draft, eventRuleErrors(draft));
  await db.events.add(ev);
  return ev;
}

export async function updateEvent(id: string, patch: Partial<PlannerEvent>): Promise<PlannerEvent> {
  const current = await db.events.get(id);
  if (!current) throw new Error("Questo blocco non esiste più");
  const next = { ...current, ...patch, id };
  const ev = validate(EventSchema, next, eventRuleErrors(next));
  await db.events.put(ev);
  return ev;
}

export async function deleteEvent(id: string): Promise<PlannerEvent | undefined> {
  const ev = await db.events.get(id);
  await db.events.delete(id);
  return ev;
}

export async function restoreEvent(ev: PlannerEvent): Promise<void> {
  await db.events.put(validate(EventSchema, ev));
}

/** Removes a single occurrence of a recurring block. */
export async function skipOccurrence(id: string, date: string): Promise<void> {
  const ev = await db.events.get(id);
  if (!ev) return;
  if (ev.repeatDays.length === 0) {
    await db.events.delete(id);
    return;
  }
  if (!ev.skipDates.includes(date)) await db.events.put({ ...ev, skipDates: [...ev.skipDates, date] });
}

/* ───────────────────────── Focus ───────────────────────── */

const ACTIVE_KEY = "activeFocus";

export async function getActiveFocus(): Promise<ActiveFocus | null> {
  const row = await db.kv.get(ACTIVE_KEY);
  if (!row) return null;
  const parsed = ActiveFocusSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

export async function setActiveFocus(a: ActiveFocus): Promise<void> {
  await db.kv.put({ key: ACTIVE_KEY, value: validate(ActiveFocusSchema, a) });
}

export async function clearActiveFocus(): Promise<void> {
  await db.kv.delete(ACTIVE_KEY);
}

/** Saves a finished session and credits the real focused minutes to its task. */
export async function saveFocusSession(record: FocusSession): Promise<FocusSession> {
  const s = validate(FocusSessionSchema, record);
  await db.transaction("rw", db.focusSessions, db.tasks, async () => {
    await db.focusSessions.add(s);
    if (s.taskId) {
      const t = await db.tasks.get(s.taskId);
      if (t) {
        await db.tasks.put({
          ...t,
          actualMin: t.actualMin + Math.round(s.actualSec / 60),
          status: t.status === "todo" ? "in_progress" : t.status,
          updatedAt: Date.now(),
        });
      }
    }
  });
  return s;
}

export async function deleteFocusSession(id: string): Promise<void> {
  await db.transaction("rw", db.focusSessions, db.tasks, async () => {
    const s = await db.focusSessions.get(id);
    if (!s) return;
    if (s.taskId) {
      const t = await db.tasks.get(s.taskId);
      if (t) await db.tasks.put({ ...t, actualMin: Math.max(0, t.actualMin - Math.round(s.actualSec / 60)), updatedAt: Date.now() });
    }
    await db.focusSessions.delete(id);
  });
}

/* ───────────────────────── Sleep ───────────────────────── */

export async function upsertSleep(input: Omit<SleepLog, "updatedAt">): Promise<SleepLog> {
  const log = validate(SleepLogSchema, { ...input, updatedAt: Date.now() });
  await db.sleepLogs.put(log);
  return log;
}

export async function deleteSleep(date: string): Promise<void> {
  await db.sleepLogs.delete(date);
}

/* ───────────────────────── Goals ───────────────────────── */

export type GoalInput = Partial<Omit<Goal, "id" | "createdAt" | "updatedAt">> & Pick<Goal, "title" | "domain" | "level" | "startDate">;

export async function createGoal(input: GoalInput): Promise<Goal> {
  const now = Date.now();
  const draft: Goal = {
    id: uid(),
    description: "",
    parentId: null,
    targetDate: null,
    outcome: "",
    kind: "qualitative",
    unit: "",
    baseline: 0,
    target: 1,
    checkins: [],
    milestones: [],
    status: "active",
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  const g = validate(GoalSchema, draft, goalRuleErrors(draft));
  if (g.parentId && !(await db.goals.get(g.parentId))) throw new Error("Obiettivo superiore non trovato");
  await db.goals.add(g);
  return g;
}

export async function updateGoal(id: string, patch: Partial<Goal>): Promise<Goal> {
  const cur = await db.goals.get(id);
  if (!cur) throw new Error("Questo obiettivo non esiste più");
  const next = { ...cur, ...patch, id, updatedAt: Date.now() };
  if (next.parentId === id) throw new ValidationError({ parentId: "Un obiettivo non può contenere se stesso" });
  // Prevent cycles: walk up from the new parent.
  let p = next.parentId;
  while (p) {
    if (p === id) throw new ValidationError({ parentId: "Questo creerebbe un ciclo nella gerarchia" });
    p = (await db.goals.get(p))?.parentId ?? null;
  }
  const g = validate(GoalSchema, next, goalRuleErrors(next));
  await db.goals.put(g);
  return g;
}

/** Deletes a goal; its children move up to its parent and linked tasks are unlinked. */
export async function deleteGoal(id: string): Promise<void> {
  await db.transaction("rw", db.goals, db.tasks, async () => {
    const g = await db.goals.get(id);
    if (!g) return;
    const kids = await db.goals.where("parentId").equals(id).toArray();
    for (const k of kids) await db.goals.put({ ...k, parentId: g.parentId, updatedAt: Date.now() });
    const tasks = await db.tasks.filter((t) => t.goalId === id).toArray();
    for (const t of tasks) await db.tasks.put({ ...t, goalId: null, updatedAt: Date.now() });
    await db.goals.delete(id);
  });
}

export async function addCheckin(id: string, checkin: { date: string; value: number; note: string }): Promise<Goal> {
  const g = await db.goals.get(id);
  if (!g) throw new Error("Questo obiettivo non esiste più");
  const checkins = [...g.checkins, checkin].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return updateGoal(id, { checkins });
}

export async function removeCheckin(id: string, index: number): Promise<Goal> {
  const g = await db.goals.get(id);
  if (!g) throw new Error("Questo obiettivo non esiste più");
  return updateGoal(id, { checkins: g.checkins.filter((_, i) => i !== index) });
}

/* ───────────────────────── Domain records ───────────────────────── */

export async function saveRecord(input: { id?: string; type: string; date: string; data: Record<string, unknown> }): Promise<DomainRecord> {
  const now = Date.now();
  const existing = input.id ? await db.records.get(input.id) : undefined;
  let data: Record<string, unknown>;
  try {
    data = validate(dataSchema(input.type), input.data);
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw e;
  }
  const rec = validate(RecordSchema, {
    id: input.id ?? uid(),
    type: input.type,
    date: input.date,
    data,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  await db.records.put(rec);
  return rec;
}

export async function deleteRecord(id: string): Promise<DomainRecord | undefined> {
  const r = await db.records.get(id);
  await db.records.delete(id);
  return r;
}

export async function restoreRecord(r: DomainRecord): Promise<void> {
  await db.records.put(validate(RecordSchema, r));
}

/* ───────────────────────── Export / import / delete ───────────────────────── */

const TABLE_SCHEMAS: Record<TableName, z.ZodType> = {
  settings: SettingsSchema,
  tasks: TaskSchema,
  habits: HabitSchema,
  habitLogs: HabitLogSchema,
  events: EventSchema,
  focusSessions: FocusSessionSchema,
  sleepLogs: SleepLogSchema,
  dayMeta: DayMetaSchema,
  kv: KvSchema,
  goals: GoalSchema,
  records: RecordSchema,
};

export const EXPORT_VERSION = 2;

export type ExportFile = {
  app: "discipline-os";
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
};

export async function exportAll(): Promise<ExportFile> {
  const data = {} as Record<TableName, unknown[]>;
  await db.transaction("r", TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) data[t] = await db.table(t).toArray();
  });
  return { app: "discipline-os", version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Validates every row of every table; throws an Italian message on the first problem. */
export function validateTables(data: Record<string, unknown[] | undefined>): Record<TableName, unknown[]> {
  const clean = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) {
    const parsed = z.array(TABLE_SCHEMAS[t]).safeParse(data[t] ?? []);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`Record ${t} non valido in ${issue.path.join(".")}: ${issue.message}`);
    }
    clean[t] = parsed.data;
  }
  return clean;
}

/** Replaces all local data with a previously exported file, after validating every record. */
export async function importAll(raw: unknown): Promise<{ counts: Record<string, number> }> {
  const envelope = z
    .object({ app: z.literal("discipline-os"), version: z.number().int().max(EXPORT_VERSION), data: z.record(z.string(), z.array(z.unknown())) })
    .safeParse(raw);
  if (!envelope.success) throw new Error("Questo file non è un'esportazione di Unbeatable.");

  const clean = validateTables(envelope.data.data);
  const counts: Record<string, number> = {};
  for (const t of TABLES) counts[t] = clean[t].length;
  await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkAdd(clean[t]);
    }
  });
  return { counts };
}

/** Permanently erases every record stored by Unbeatable on this device. */
export async function deleteAllData(): Promise<void> {
  await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
  });
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("dos:")) localStorage.removeItem(k);
  } catch {
    /* storage may be unavailable */
  }
}
