import { useLiveQuery } from "dexie-react-hooks";
import { Check, ListChecks, X } from "lucide-react";
import { db } from "@/db/db";
import { useApp } from "@/hooks/app";
import { Card, CardHeader } from "@/components/ui/misc";
import { answerCheck, checkId, isCheckable } from "@/lib/checks";
import { occurrencesOn } from "@/lib/planner";
import { cn } from "@/lib/utils";

/** Today's planned blocks that have started: answer "Lo stai facendo?" here too (works on PC). */
export function BlockChecks() {
  const { today, nowMin } = useApp();
  const events = useLiveQuery(() => db.events.toArray(), []) ?? [];
  const answers = useLiveQuery(async () => new Map((await db.records.where("[type+date]").equals(["blockCheck", today]).toArray()).map((r) => [r.id, r.data.answer])), [today]);
  const due = occurrencesOn(events.filter(isCheckable), today).filter((o) => o.start <= nowMin);
  if (!due.length || !answers) return null;
  const done = due.filter((o) => answers.get(checkId(o.event.id, today)) === "yes").length;
  return (
    <Card className="mb-5">
      <CardHeader title={`Check di oggi · ${done}/${due.length}`} icon={<ListChecks />} />
      <ul className="flex flex-col divide-y divide-line px-4 pb-3">
        {due
          .slice()
          .reverse()
          .map((o) => {
            const a = answers.get(checkId(o.event.id, today));
            return (
              <li key={o.key} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-[13px] text-fg">
                  <span className="tabular mr-2 text-subtle">{o.event.start}</span>
                  {o.event.title}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {(["yes", "no"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => answerCheck(o.event.id, today, o.event.title, v === "yes")}
                      className={cn(
                        "flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs transition-colors",
                        a === v ? (v === "yes" ? "border-ok/50 bg-ok/15 text-ok" : "border-danger/50 bg-danger/15 text-danger") : "border-line text-muted hover:text-fg",
                      )}
                    >
                      {v === "yes" ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      {v === "yes" ? "Sì" : "No"}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
      </ul>
    </Card>
  );
}
