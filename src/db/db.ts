/** Marks a deleted row so merging another device's copy does not bring it back. */
export type Tombstone = { key: string; table: string; id: string; at: number };

import Dexie, { type EntityTable } from "dexie";
import type {
  DayMeta,
  FocusSession,
  Habit,
  HabitLog,
  Goal,
  DomainRecord,
  Kv,
  PlannerEvent,
  Settings,
  SleepLog,
  Task,
} from "./schema";

/**
 * Local-first storage in the browser's IndexedDB.
 * Devices are kept in step by merging sync files (see sync.ts).
 */
export class DisciplineDB extends Dexie {
  settings!: EntityTable<Settings, "id">;
  tasks!: EntityTable<Task, "id">;
  habits!: EntityTable<Habit, "id">;
  habitLogs!: EntityTable<HabitLog, "id">;
  events!: EntityTable<PlannerEvent, "id">;
  focusSessions!: EntityTable<FocusSession, "id">;
  sleepLogs!: EntityTable<SleepLog, "date">;
  dayMeta!: EntityTable<DayMeta, "date">;
  kv!: EntityTable<Kv, "key">;
  goals!: EntityTable<Goal, "id">;
  records!: EntityTable<DomainRecord, "id">;
  tombstones!: EntityTable<Tombstone, "key">;

  constructor(name = "discipline-os") {
    super(name);
    this.version(1).stores({
      settings: "id",
      tasks: "id, status, domain, dueDate, scheduledDate, missionDate, completedAt, updatedAt",
      habits: "id, order",
      habitLogs: "id, habitId, date",
      events: "id, date",
      focusSessions: "id, date, taskId, startedAt",
      sleepLogs: "date",
      dayMeta: "date",
      kv: "key",
    });
    // Phase 2: goal hierarchy and domain records. Additive — existing data untouched.
    this.version(2).stores({
      goals: "id, parentId, level, domain, status",
      records: "id, type, date, [type+date]",
    });
    // v3: deletion markers so a delete on one device propagates when syncing.
    this.version(3)
      .stores({ tombstones: "key, at" })
      .upgrade((tx) =>
        // Neutral palette: swap the old bright default domain colours.
        tx.table("settings").toCollection().modify((st: { domains?: { color: string }[] }) => {
          const map: Record<string, string> = { "#2fd4a1": "#7fa892", "#4aa8ff": "#7f98b3", "#fbb954": "#b5a07a", "#b08cff": "#9a90b0", "#ff7ab8": "#b08f9c" };
          for (const d of st.domains ?? []) d.color = map[d.color.toLowerCase()] ?? d.color;
        }),
      );
  }
}

export const db = new DisciplineDB();

export const TABLES = [
  "settings",
  "tasks",
  "habits",
  "habitLogs",
  "events",
  "focusSessions",
  "sleepLogs",
  "dayMeta",
  "kv",
  "goals",
  "records",
] as const;
export type TableName = (typeof TABLES)[number];

/** Tables whose deletions are tracked (settings/kv are device-local state). */
export const SYNCED: TableName[] = ["tasks", "habits", "habitLogs", "events", "focusSessions", "sleepLogs", "dayMeta", "goals", "records"];

/** When false, hooks do not write tombstones (used while applying a merge). */
export const trackDeletes = { on: true };

for (const t of SYNCED) {
  const table = db.table(t);
  table.hook("deleting", function (pk, _obj, tx) {
    if (!trackDeletes.on) return;
    const id = String(pk);
    tx.on("complete", () => {
      void db.tombstones.put({ key: `${t}:${id}`, table: t, id, at: Date.now() });
    });
  });
  table.hook("creating", function (pk, obj, tx) {
    if (!trackDeletes.on) return;
    const id = String(pk ?? (obj as Record<string, unknown>).id ?? (obj as Record<string, unknown>).date);
    tx.on("complete", () => {
      void db.tombstones.delete(`${t}:${id}`);
    });
  });
}
