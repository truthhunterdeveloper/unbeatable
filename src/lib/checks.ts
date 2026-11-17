import { db } from "@/db/db";
import { saveRecord } from "@/db/repo";
import type { PlannerEvent } from "@/db/schema";

/** Blocks that get a "are you doing this?" check. School hours and breaks are left alone. */
export function isCheckable(e: Pick<PlannerEvent, "category">): boolean {
  return e.category !== "school" && e.category !== "break";
}

export function checkId(eventId: string, date: string) {
  return `chk-${eventId}@${date}`;
}

export async function answerCheck(eventId: string, date: string, title: string, yes: boolean) {
  await saveRecord({ id: checkId(eventId, date), type: "blockCheck", date, data: { title, answer: yes ? "yes" : "no" } });
}

export async function checksOn(date: string): Promise<Map<string, "yes" | "no">> {
  const rs = await db.records.where("[type+date]").equals(["blockCheck", date]).toArray();
  return new Map(rs.map((r) => [r.id, r.data.answer as "yes" | "no"]));
}
