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

/** Focus domain for a planner category, when a "Sì" should start a focus session. */
export function focusDomainOf(category: string): string | null {
  return ({ study: "school", deen: "deen", football: "football", refereeing: "football", business: "business", personal: "personal" } as Record<string, string>)[category] ?? null;
}

/**
 * First free slot of `duration` minutes for a missed block: today after `fromMin`,
 * otherwise tomorrow from 14:00. Never overlaps other blocks and never goes past
 * bedtime (recovery must not cost sleep).
 */
export function recoverySlot(
  busy: (date: string) => { start: number; end: number }[],
  today: string,
  tomorrow: string,
  fromMin: number,
  duration: number,
  wakeMin: number,
  bedMin: number,
): { date: string; start: number } | null {
  const tries: [string, number][] = [
    [today, Math.max(fromMin, wakeMin)],
    [tomorrow, Math.max(14 * 60, wakeMin)],
  ];
  for (const [date, from] of tries) {
    const taken = busy(date);
    for (let s = Math.ceil(from / 15) * 15; s + duration <= bedMin; s += 15) {
      if (!taken.some((b) => s < b.end && b.start < s + duration)) return { date, start: s };
    }
  }
  return null;
}
