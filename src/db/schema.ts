/**
 * Unbeatable — data model.
 *
 * Every record written to storage is validated against these Zod schemas
 * (see repo.ts). Types are inferred from the schemas so the UI, the logic
 * layer and the database can never silently drift apart.
 */
import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Inserisci una data valida");
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Inserisci un orario valido (HH:MM)");
const id = z.string().min(1);
const timestamp = z.number().int().nonnegative();

/* ───────────────────────── Settings ───────────────────────── */

export const DomainSchema = z.object({
  id,
  label: z.string().trim().min(1, "Dai un nome all'area").max(32, "Massimo 32 caratteri"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  enabled: z.boolean(),
});
export type Domain = z.infer<typeof DomainSchema>;

export const ModeSchema = z.enum(["standard", "intense", "recovery"]);
export type Mode = z.infer<typeof ModeSchema>;

export const SettingsSchema = z.object({
  id: z.literal("settings"),
  name: z.string().trim().min(1, "Inserisci il nome con cui vuoi essere chiamato").max(40),
  timeZone: z.string().min(1),
  weekStart: z.union([z.literal(0), z.literal(1)]),
  domains: z.array(DomainSchema).min(1, "Mantieni almeno un'area di vita"),
  wakeTime: hhmm,
  bedTime: hhmm,
  focusMinutes: z.number().int().min(5, "Minimo 5 minuti").max(180, "Massimo 180 minuti"),
  breakMinutes: z.number().int().min(1, "Minimo 1 minuto").max(60, "Massimo 60 minuti"),
  longFocusMinutes: z.number().int().min(30, "Minimo 30 minuti").max(240, "Massimo 240 minuti"),
  mode: ModeSchema,
  notifications: z.boolean(),
  /** Private, optional prayer tracking. Undefined (older data) means on. */
  prayerTracking: z.boolean().optional(),
  /** Hours between motivational notifications; 0 = off. Undefined means every 2 hours. */
  motivationEvery: z.number().int().min(0).max(12).optional(),
  /** Minutes between motivational messages; 0 = off. Replaces motivationEvery. */
  motivationMinutes: z.number().int().min(0).max(1440).optional(),
  /** Window for motivational messages (default: wake → bed time). */
  motivationFrom: hhmm.optional(),
  motivationTo: hhmm.optional(),
  /** "Lo stai facendo?" at the start of each block. Undefined means on. */
  blockChecks: z.boolean().optional(),
  /** Minutes of warning before each block; 0 = off. Undefined means 5. */
  preBlockMin: z.number().int().min(0).max(120).optional(),
  /** Location for prayer times (set from the device's position). */
  prayerLat: z.number().min(-90).max(90).optional(),
  prayerLon: z.number().min(-180).max(180).optional(),
  /** Notification at each prayer time. Undefined means on once a location is set. */
  prayerAlerts: z.boolean().optional(),
  onboardedAt: timestamp.nullable(),
  createdAt: timestamp,
});
export type Settings = z.infer<typeof SettingsSchema>;

/* ───────────────────────── Tasks ───────────────────────── */

export const TaskStatusSchema = z.enum(["todo", "in_progress", "done"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id,
  title: z.string().trim().min(1, "Dai un titolo all'attività").max(140, "Massimo 140 caratteri"),
  description: z.string().max(2000),
  /** 1 = high, 2 = medium, 3 = low */
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  important: z.boolean(),
  urgent: z.boolean(),
  optional: z.boolean(),
  domain: z.string().min(1, "Scegli un'area di vita"),
  dueDate: isoDate.nullable(),
  /** The day the user intends to work on it (planner / today list). */
  scheduledDate: isoDate.nullable(),
  estimateMin: z.number().int().min(1).max(1440).nullable(),
  /** Real time spent: focus-session credit plus manual entries. Never planned time. */
  actualMin: z.number().int().min(0).max(100000),
  status: TaskStatusSchema,
  /** Set when pinned to Today's Mission for that date. */
  missionDate: isoDate.nullable(),
  /** Reserved for Phase 2 (goal hierarchy & business projects). */
  goalId: z.string().nullable(),
  projectId: z.string().nullable(),
  notes: z.string().max(5000),
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: timestamp.nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export function taskRuleErrors(t: Pick<Task, "important" | "optional">): Record<string, string> {
  return t.important && t.optional ? { optional: "Un'attività non può essere sia importante che facoltativa" } : {};
}

/* ───────────────────────── Habits ───────────────────────── */

export const FrequencySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({
    type: z.literal("days"),
    days: z.array(z.number().int().min(0).max(6)).min(1, "Scegli almeno un giorno"),
  }),
  z.object({
    type: z.literal("weekly"),
    timesPerWeek: z.number().int().min(1, "Almeno una volta").max(7, "Al massimo 7"),
  }),
]);
export type Frequency = z.infer<typeof FrequencySchema>;

/**
 * essential — kept in every mode, including Recovery.
 * standard  — expected in Standard and High-intensity modes.
 * optional  — always a bonus; never counted as missed.
 */
export const HabitTierSchema = z.enum(["essential", "standard", "optional"]);
export type HabitTier = z.infer<typeof HabitTierSchema>;

export const HabitSchema = z.object({
  id,
  name: z.string().trim().min(1, "Dai un nome all'abitudine").max(60, "Massimo 60 caratteri"),
  description: z.string().max(500),
  domain: z.string().min(1),
  frequency: FrequencySchema,
  target: z.number().int().min(1, "L'obiettivo deve essere almeno 1").max(1000),
  unit: z.string().trim().max(16),
  estimateMin: z.number().int().min(1).max(600).nullable(),
  tier: HabitTierSchema,
  reminderTime: hhmm.nullable(),
  notes: z.string().max(2000),
  archived: z.boolean(),
  startDate: isoDate,
  order: z.number(),
  createdAt: timestamp,
  /** Last edit; used so the newest version wins when syncing devices. */
  updatedAt: timestamp.optional(),
});
export type Habit = z.infer<typeof HabitSchema>;

export const ExcuseSchema = z.enum(["rest", "illness", "injury", "travel", "other"]);
export type Excuse = z.infer<typeof ExcuseSchema>;

export const HabitLogSchema = z.object({
  /** `${habitId}:${date}` — one log per habit per day. */
  id,
  habitId: id,
  date: isoDate,
  value: z.number().int().min(0).max(1000),
  /** Excused days are removed from the denominator entirely. */
  excused: ExcuseSchema.nullable(),
  updatedAt: timestamp,
});
export type HabitLog = z.infer<typeof HabitLogSchema>;

/* ───────────────────────── Planner ───────────────────────── */

export const EventCategorySchema = z.enum([
  "school",
  "study",
  "football",
  "refereeing",
  "deen",
  "business",
  "meal",
  "break",
  "personal",
  "other",
]);
export type EventCategory = z.infer<typeof EventCategorySchema>;

export const EventSchema = z.object({
  id,
  title: z.string().trim().min(1, "Dai un titolo al blocco").max(80),
  category: EventCategorySchema,
  start: hhmm,
  end: hhmm,
  /** One-off date, or first date of a recurring series. */
  date: isoDate,
  /** Weekdays (0 = Sunday). Empty = one-off. */
  repeatDays: z.array(z.number().int().min(0).max(6)),
  until: isoDate.nullable(),
  /** Individual occurrences removed from a recurring series. */
  skipDates: z.array(isoDate),
  taskId: z.string().nullable(),
  notes: z.string().max(1000),
  createdAt: timestamp,
  /** Last edit; used so the newest version wins when syncing devices. */
  updatedAt: timestamp.optional(),
});
export type PlannerEvent = z.infer<typeof EventSchema>;

export function eventRuleErrors(e: Pick<PlannerEvent, "start" | "end" | "until" | "date">): Record<string, string> {
  const errors: Record<string, string> = {};
  if (e.end <= e.start) errors.end = "La fine deve essere dopo l'inizio (niente blocchi notturni: il sonno deriva dal tuo orario)";
  if (e.until && e.until < e.date) errors.until = "La fine della ripetizione non può precedere l'inizio";
  return errors;
}

/* ───────────────────────── Focus ───────────────────────── */

export const FocusKindSchema = z.enum(["pomodoro", "long", "custom"]);
export type FocusKind = z.infer<typeof FocusKindSchema>;

export const DistractionSchema = z.object({ at: timestamp, note: z.string().max(200) });
export type Distraction = z.infer<typeof DistractionSchema>;

export const FocusSessionSchema = z.object({
  id,
  date: isoDate,
  taskId: z.string().nullable(),
  label: z.string().trim().min(1).max(140),
  domain: z.string().nullable(),
  kind: FocusKindSchema,
  plannedMin: z.number().int().min(1).max(600),
  /** Seconds actually spent focusing (timer running). */
  actualSec: z.number().int().min(0),
  /** Seconds the session was paused — interrupted time. */
  pausedSec: z.number().int().min(0),
  outcome: z.enum(["completed", "ended_early"]),
  distractions: z.array(DistractionSchema),
  notes: z.string().max(2000),
  /** Self-rated focus quality 1–5, optional. */
  quality: z.number().int().min(1).max(5).nullable(),
  startedAt: timestamp,
  endedAt: timestamp,
});
export type FocusSession = z.infer<typeof FocusSessionSchema>;

/** The in-progress timer. Stored so a reload never loses a running session. */
export const ActiveFocusSchema = z.object({
  id: id,
  phase: z.enum(["focus", "review", "break"]),
  taskId: z.string().nullable(),
  label: z.string(),
  domain: z.string().nullable(),
  kind: FocusKindSchema,
  plannedMin: z.number().int().min(1).max(600),
  breakMin: z.number().int().min(1).max(60),
  startedAt: timestamp,
  accumulatedMs: z.number().min(0),
  runningSince: timestamp.nullable(),
  pausedSince: timestamp.nullable(),
  pausedMs: z.number().min(0),
  distractions: z.array(DistractionSchema),
  reachedTarget: z.boolean(),
  endedAt: timestamp.nullable(),
  breakEndsAt: timestamp.nullable(),
});
export type ActiveFocus = z.infer<typeof ActiveFocusSchema>;

/* ───────────────────────── Recovery ───────────────────────── */

export const SleepLogSchema = z.object({
  /** The morning you woke up. */
  date: isoDate,
  bedTime: hhmm,
  wakeTime: hhmm,
  quality: z.number().int().min(1).max(5).nullable(),
  updatedAt: timestamp,
});
export type SleepLog = z.infer<typeof SleepLogSchema>;

export const DayMetaSchema = z.object({
  date: isoDate,
  mode: ModeSchema,
  updatedAt: timestamp,
});
export type DayMeta = z.infer<typeof DayMetaSchema>;

export const KvSchema = z.object({ key: z.string().min(1), value: z.unknown() });
export type Kv = z.infer<typeof KvSchema>;

/* ───────────────────────── Goals (Phase 2) ───────────────────────── */

export const GoalLevelSchema = z.enum(["vision", "annual", "quarterly", "monthly", "weekly"]);
export type GoalLevel = z.infer<typeof GoalLevelSchema>;

export const MilestoneSchema = z.object({
  id,
  title: z.string().trim().min(1, "Dai un nome al traguardo").max(120),
  doneAt: timestamp.nullable(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const CheckinSchema = z.object({
  date: isoDate,
  value: z.number().finite(),
  note: z.string().max(300),
});
export type Checkin = z.infer<typeof CheckinSchema>;

export const GoalSchema = z.object({
  id,
  title: z.string().trim().min(1, "Dai un titolo all'obiettivo").max(140),
  description: z.string().max(2000),
  domain: z.string().min(1),
  level: GoalLevelSchema,
  parentId: z.string().nullable(),
  startDate: isoDate,
  targetDate: isoDate.nullable(),
  /** The measurable outcome, in words. */
  outcome: z.string().max(300),
  kind: z.enum(["quantitative", "qualitative"]),
  unit: z.string().max(24),
  baseline: z.number().finite(),
  target: z.number().finite(),
  /** Evidence: dated measurements. Progress comes only from these. */
  checkins: z.array(CheckinSchema),
  milestones: z.array(MilestoneSchema),
  status: z.enum(["active", "achieved", "missed", "paused"]),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Goal = z.infer<typeof GoalSchema>;

export function goalRuleErrors(g: Pick<Goal, "kind" | "baseline" | "target" | "startDate" | "targetDate">): Record<string, string> {
  const e: Record<string, string> = {};
  if (g.kind === "quantitative" && g.baseline === g.target) e.target = "L'obiettivo deve essere diverso dal valore di partenza";
  if (g.targetDate && g.targetDate < g.startDate) e.targetDate = "La scadenza non può precedere l'inizio";
  return e;
}

/* ───────────── Domain records (Deen, Football, Business, School, Personal) ───────────── */

export const RecordSchema = z.object({
  id,
  type: z.string().min(1),
  date: isoDate,
  data: z.record(z.string(), z.unknown()),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type DomainRecord = z.infer<typeof RecordSchema>;
