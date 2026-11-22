import { useLiveQuery } from "dexie-react-hooks";
import { Check, ListChecks, RotateCcw, Trophy, X } from "lucide-react";
import { db } from "@/db/db";
import { createEvent, skipOccurrence } from "@/db/repo";
import { useApp } from "@/hooks/app";
import { useFocus } from "@/features/focus/FocusProvider";
import { Card, CardHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { answerCheck, checkId, focusDomainOf, isCheckable, recoverySlot } from "@/lib/checks";
import { occurrencesOn } from "@/lib/planner";
import { addDays, hmToMin, minToHm } from "@/lib/date";
import { cn, errorMessage } from "@/lib/utils";

/**
 * Today's planned blocks that have started: answer "Lo stai facendo?" here too.
 * Sì starts a focus session for the rest of the block; No offers a recovery slot.
 */
export function BlockChecks() {
  const { today, nowMin, settings } = useApp();
  const focus = useFocus();
  const toast = useToast();
  const events = useLiveQuery(() => db.events.toArray(), []) ?? [];
  const answers = useLiveQuery(async () => new Map((await db.records.where("[type+date]").equals(["blockCheck", today]).toArray()).map((r) => [r.id, r.data.answer])), [today]);
  const todayOcc = occurrencesOn(events.filter(isCheckable), today);
  const due = todayOcc.filter((o) => o.start <= nowMin);
  const studyLeft = todayOcc.filter((o) => o.event.category === "study" && o.end > nowMin);
  if ((!due.length && !studyLeft.length) || !answers) return null;
  const done = due.filter((o) => answers.get(checkId(o.event.id, today)) === "yes").length;

  async function yes(o: (typeof due)[number]) {
    await answerCheck(o.event.id, today, o.event.title, true);
    const domain = focusDomainOf(o.event.category);
    const left = o.end - nowMin;
    if (!domain || left < 5 || focus.active) return;
    try {
      await focus.start({ taskId: o.event.taskId, label: o.event.title, domain, kind: "custom", plannedMin: Math.min(240, left) });
      toast.success(`Focus avviato: ${o.event.title} (${left} min)`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function recover(o: (typeof due)[number]) {
    const tomorrow = addDays(today, 1);
    const busy = (date: string) => occurrencesOn(events, date).map((x) => ({ start: x.start, end: x.end }));
    const slot = recoverySlot(busy, today, tomorrow, nowMin + 10, o.end - o.start, hmToMin(settings.wakeTime), hmToMin(settings.bedTime));
    if (!slot) {
      toast.info("Nessuno spazio libero oggi o domani senza togliere sonno. Recupera nel weekend.");
      return;
    }
    try {
      await createEvent({ title: `Recupero: ${o.event.title}`, category: o.event.category, date: slot.date, start: minToHm(slot.start), end: minToHm(slot.start + (o.end - o.start)) });
      toast.success(`Recupero messo ${slot.date === today ? "oggi" : "domani"} alle ${minToHm(slot.start)}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function gameDay() {
    for (const o of studyLeft) await skipOccurrence(o.event.id, today);
    toast.success(`Giorno di gara: ${studyLeft.length} blocchi di studio saltati oggi. Recuperali in settimana.`);
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title={`Check di oggi · ${done}/${due.length}`}
        icon={<ListChecks />}
        action={
          studyLeft.length ? (
            <button type="button" onClick={gameDay} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-subtle hover:bg-white/5 hover:text-fg">
              <Trophy className="size-3.5" /> Oggi ho gara
            </button>
          ) : null
        }
      />
      <ul className="flex flex-col divide-y divide-line px-4 pb-3">
        {due
          .slice()
          .reverse()
          .map((o) => {
            const a = answers.get(checkId(o.event.id, today));
            return (
              <li key={o.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                  <span className="tabular mr-2 text-subtle">{o.event.start}</span>
                  {o.event.title}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {a === "no" && !o.event.title.startsWith("Recupero") ? (
                    <button type="button" onClick={() => recover(o)} className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-muted hover:text-fg">
                      <RotateCcw className="size-3.5" /> Recupera
                    </button>
                  ) : null}
                  {(["yes", "no"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => (v === "yes" ? yes(o) : answerCheck(o.event.id, today, o.event.title, false))}
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
