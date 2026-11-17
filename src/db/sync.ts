import Dexie from "dexie";
import { z } from "zod";
import { SYNCED, TABLES, db, trackDeletes, type TableName, type Tombstone } from "./db";
import { EXPORT_VERSION, exportAll, validateTables, type ExportFile } from "./repo";

/**
 * Sync between devices (iPhone ↔ PC) without a server.
 * Each device exports a sync file; the other merges it. Merging never loses
 * anything: for each record the newest version wins, deletions travel as
 * tombstones, and a safety backup is taken before every merge.
 */

type Row = Record<string, unknown>;

export function rowKey(t: TableName, r: Row): string {
  return String(t === "sleepLogs" || t === "dayMeta" ? r.date : t === "kv" ? r.key : r.id);
}

function stamp(r: Row): number {
  return Number(r.updatedAt ?? r.createdAt ?? r.startedAt ?? 0) || 0;
}

/** Pure merge of two exports. Exported for tests. */
export function mergeData(
  local: Record<TableName, Row[]>,
  remote: Record<string, Row[] | undefined>,
  localTomb: Tombstone[],
  remoteTomb: Tombstone[],
): { data: Record<TableName, Row[]>; tombstones: Tombstone[]; added: number; updated: number; removed: number } {
  const tombs = new Map<string, Tombstone>();
  for (const t of [...localTomb, ...remoteTomb]) {
    const cur = tombs.get(t.key);
    if (!cur || t.at > cur.at) tombs.set(t.key, t);
  }
  const data = {} as Record<TableName, Row[]>;
  let added = 0,
    updated = 0,
    removed = 0;
  for (const t of TABLES) {
    const byKey = new Map<string, Row>();
    for (const r of local[t] ?? []) byKey.set(rowKey(t, r), r);
    // Settings and device state (kv: running timer, etc.) stay per device.
    if (SYNCED.includes(t)) {
      for (const r of remote[t] ?? []) {
        const k = rowKey(t, r);
        const mine = byKey.get(k);
        if (!mine) {
          byKey.set(k, r);
          added++;
        } else if (stamp(r) > stamp(mine)) {
          byKey.set(k, r);
          updated++;
        }
      }
      for (const [k, r] of byKey) {
        const tomb = tombs.get(`${t}:${k}`);
        if (tomb && tomb.at >= stamp(r)) {
          byKey.delete(k);
          if ((local[t] ?? []).some((x) => rowKey(t, x) === k)) removed++;
        }
      }
    } else if (byKey.size === 0) {
      for (const r of remote[t] ?? []) byKey.set(rowKey(t, r), r);
    }
    data[t] = [...byKey.values()];
  }
  return { data, tombstones: [...tombs.values()], added, updated, removed };
}

export type SyncFile = ExportFile & { tombstones: Tombstone[]; device: string };

export async function exportSync(): Promise<SyncFile> {
  const base = await exportAll();
  return { ...base, tombstones: await db.tombstones.toArray(), device: deviceName() };
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  return /iPhone|iPad/.test(ua) ? "iPhone" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "PC" : "Dispositivo";
}

const TombSchema = z.object({ key: z.string(), table: z.string(), id: z.string(), at: z.number() });

/** Merges another device's export into this one. Accepts plain exports too. */
export async function mergeSync(raw: unknown): Promise<{ added: number; updated: number; removed: number }> {
  const env = z
    .object({ app: z.literal("discipline-os"), version: z.number().int().max(EXPORT_VERSION), data: z.record(z.string(), z.array(z.unknown())), tombstones: z.array(TombSchema).optional() })
    .safeParse(raw);
  if (!env.success) throw new Error("Questo file non è un file di Unbeatable.");
  const remote = validateTables(env.data.data);
  await snapshot("prima della sincronizzazione");
  const local = (await exportAll()).data as Record<TableName, Row[]>;
  const res = mergeData(local, remote as Record<string, Row[]>, await db.tombstones.toArray(), env.data.tombstones ?? []);
  trackDeletes.on = false;
  try {
    await db.transaction("rw", [...TABLES.map((t) => db.table(t)), db.tombstones], async () => {
      for (const t of SYNCED) {
        await db.table(t).clear();
        await db.table(t).bulkAdd(res.data[t]);
      }
      for (const t of TABLES) if (!SYNCED.includes(t) && (await db.table(t).count()) === 0) await db.table(t).bulkAdd(res.data[t]);
      await db.tombstones.clear();
      await db.tombstones.bulkAdd(res.tombstones);
    });
  } finally {
    trackDeletes.on = true;
  }
  try {
    localStorage.setItem("dos:lastSync", new Date().toISOString());
  } catch {
    /* optional */
  }
  return { added: res.added, updated: res.updated, removed: res.removed };
}

/* ── Automatic backups, kept in a separate database ── */

type Snapshot = { id?: number; at: number; reason: string; file: string };
const backupDb = new Dexie("unbeatable-backups");
backupDb.version(1).stores({ snaps: "++id, at" });
const snaps = backupDb.table<Snapshot, number>("snaps");
const KEEP = 20;

export async function snapshot(reason: string): Promise<void> {
  const file = JSON.stringify(await exportSync());
  await snaps.add({ at: Date.now(), reason, file });
  const all = await snaps.orderBy("at").primaryKeys();
  if (all.length > KEEP) await snaps.bulkDelete(all.slice(0, all.length - KEEP));
  await writeNativeBackup(file);
}

export async function listSnapshots(): Promise<Omit<Snapshot, "file">[]> {
  const all = await snaps.orderBy("at").reverse().toArray();
  return all.map(({ id, at, reason }) => ({ id, at, reason }));
}

export async function snapshotFile(id: number): Promise<unknown> {
  const s = await snaps.get(id);
  if (!s) throw new Error("Backup non trovato.");
  return JSON.parse(s.file);
}

/** One automatic backup per day, at app start. */
export async function dailyBackup(): Promise<void> {
  try {
    const last = await snaps.orderBy("at").last();
    if (last && new Date(last.at).toDateString() === new Date().toDateString()) return;
    if ((await db.tasks.count()) + (await db.habits.count()) === 0) return;
    await snapshot("backup automatico giornaliero");
  } catch {
    /* backups must never break the app */
  }
}

/** On iPhone: also write the latest backup to the app's Documents folder (visible in File). */
async function writeNativeBackup(file: string) {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  await Filesystem.writeFile({ path: "Unbeatable-backup.json", data: file, directory: Directory.Documents, encoding: Encoding.UTF8 });
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persist?.()) ?? null;
  } catch {
    return null;
  }
}

/** Save or share a sync file: share sheet on iPhone (AirDrop, iCloud Drive), download on PC. */
export async function shareSyncFile(): Promise<void> {
  const data = JSON.stringify(await exportSync());
  const name = `unbeatable-sync-${deviceName().toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const w = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: "Sincronizza Unbeatable", url: w.uri });
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
