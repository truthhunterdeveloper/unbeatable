import { db } from "@/db/db";
import { saveRecord } from "@/db/repo";

const SUBJECTS: [string, "high" | "normal" | "low"][] = [
  ["Economia aziendale", "high"],
  ["Matematica", "high"],
  ["Storia", "normal"],
  ["Informatica", "normal"],
  ["Economia politica", "normal"],
  ["Diritto", "normal"],
  ["Italiano", "normal"],
  ["Spagnolo", "normal"],
  ["Inglese", "normal"],
  ["Scienze motorie", "low"],
];

/** Adds the default school subjects once (never again if some are deleted). */
let running: Promise<void> | null = null;
export function seedSubjects(today: string): Promise<void> {
  running ??= doSeed(today).finally(() => (running = null));
  return running;
}

async function doSeed(today: string): Promise<void> {
  if (await db.kv.get("seed:subjects")) return;
  if (!(await db.settings.get("settings"))?.onboardedAt) return;
  const existing = new Set((await db.records.where("type").equals("subject").toArray()).map((r) => String(r.data.name).toLowerCase()));
  for (const [name, priority] of SUBJECTS) {
    if (!existing.has(name.toLowerCase())) await saveRecord({ type: "subject", date: today, data: { name, priority, difficulty: 3, target: "" } });
  }
  await db.kv.put({ key: "seed:subjects", value: true });
}
