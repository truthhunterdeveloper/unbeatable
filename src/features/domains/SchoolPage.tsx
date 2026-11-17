import { useMemo, useState } from "react";
import { CalendarClock, GraduationCap, ListOrdered, Plus, Timer } from "lucide-react";
import { useApp } from "@/hooks/app";
import { QuoteCard } from "@/components/QuoteCard";
import { useFocusSessions, useTasks } from "@/hooks/data";
import { RecordSection, useRecords, useRefLabel } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader, Stat } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { TaskRow } from "@/features/tasks/TaskRow";
import { createTask } from "@/db/repo";
import type { DomainRecord } from "@/db/schema";
import { revisionPlan, subjectPriorities } from "@/lib/domains";
import { addDays, daysBetween, formatDuration, formatShort } from "@/lib/date";
import { errorMessage } from "@/lib/utils";

export function SchoolPage() {
  const { today, openTask } = useApp();
  const toast = useToast();
  const records = useRecords(["subject", "exam", "grade", "mistake"]);
  const tasks = useTasks();
  const sessions = useFocusSessions(addDays(today, -6), today);
  const ref = useRefLabel();
  const [planFor, setPlanFor] = useState<DomainRecord | null>(null);

  const rs = useMemo(() => records ?? [], [records]);
  const priorities = useMemo(() => subjectPriorities(rs, today), [rs, today]);
  const exams = rs.filter((r) => r.type === "exam" && r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const homework = (tasks ?? []).filter((t) => t.domain === "school" && t.status !== "done").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const studyMin = (sessions ?? []).filter((s) => s.domain === "school").reduce((a, s) => a + s.actualSec / 60, 0);
  const openMistakes = rs.filter((r) => r.type === "mistake" && !r.data.reviewed).length;
  const planTasks = (exam: DomainRecord) => (tasks ?? []).filter((t) => t.notes === `piano-esame:${exam.id}`);

  const plan = planFor ? revisionPlan(String(planFor.data.topics ?? "").split("\n"), today, planFor.date) : [];

  async function createPlan() {
    if (!planFor) return;
    try {
      for (const p of plan) {
        await createTask({ title: p.title.replace("Revise:", "Ripasso:").replace("Light full review + early night", "Ripasso leggero generale + a letto presto"), domain: "school", scheduledDate: p.date, dueDate: planFor.date, estimateMin: 45, important: true, notes: `piano-esame:${planFor.id}` });
      }
      toast.success(`Piano creato: ${plan.length} sessioni di ripasso`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Scuola"
        description="Materie, compiti, verifiche e voti. Le priorità dipendono dalle date degli esami e dalle difficoltà reali, con il motivo sempre visibile."
        actions={
          <Button variant="primary" onClick={() => openTask(undefined, { domain: "school" })}>
            <Plus /> Compito
          </Button>
        }
      />
      <QuoteCard areas={["school"]} className="mb-5" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Priorità delle materie" icon={<ListOrdered />} />
          <div className="px-4 pb-4">
            {priorities.length === 0 ? (
              <p className="text-xs text-subtle">Aggiungi le tue materie con priorità e difficoltà attuale.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {priorities.map((p, i) => (
                  <li key={p.subject.id} className="flex items-start gap-3">
                    <span className="w-4 pt-0.5 font-mono text-xs text-faint">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13px] text-fg">
                        {String(p.subject.data.name)}
                        {p.latestPct != null ? <span className="text-[11px] text-subtle">ultimo voto {Math.round(p.latestPct * 100)}%</span> : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {p.reasons.length ? p.reasons.map((r) => <Badge key={r}>{itReason(r)}</Badge>) : <span className="text-[11px] text-faint">nessun fattore urgente</span>}
                      </div>
                    </div>
                    <span className="text-xs text-subtle tabular">{p.score}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-[11px] text-faint">Punteggio = priorità base (1–3) + difficoltà (0–4) + vicinanza esame (0–4) + 1 se l'ultimo voto è sotto il 60%.</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Prossimi esami" icon={<CalendarClock />} />
          <div className="px-4 pb-4">
            {exams.length === 0 ? (
              <p className="text-xs text-subtle">Nessun esame in arrivo. Aggiungi le date per creare un piano di preparazione.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {exams.slice(0, 6).map((e) => {
                  const existing = planTasks(e);
                  const d = daysBetween(today, e.date);
                  return (
                    <li key={e.id} className="flex items-center gap-3">
                      <span className={`w-14 text-xs tabular ${d <= 7 ? "text-warn" : "text-subtle"}`}>{d === 0 ? "oggi" : `tra ${d} gg`}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-fg">{String(e.data.title)}</div>
                        <div className="text-[11px] text-subtle">
                          {ref(e.data.subjectId)} · {formatShort(e.date)}
                        </div>
                      </div>
                      {existing.length ? (
                        <Badge tone="ok">Piano: {existing.filter((t) => t.status === "done").length}/{existing.length}</Badge>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setPlanFor(e)} disabled={!String(e.data.topics ?? "").trim()} title={String(e.data.topics ?? "").trim() ? "" : "Aggiungi gli argomenti all'esame"}>
                          Crea piano
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-line px-4 py-3">
            <Stat label="Studio concentrato (7 gg)" value={formatDuration(studyMin)} sub={<span className="inline-flex items-center gap-1"><Timer className="size-3" /> sessioni area Scuola</span>} />
            <Stat label="Errori da ripassare" value={openMistakes} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Compiti e consegne" icon={<GraduationCap />} />
          <div className="px-1.5 pb-1.5">{homework.length ? homework.slice(0, 10).map((t) => <TaskRow key={t.id} task={t} compact />) : <p className="px-3 pb-3 text-xs text-subtle">Nessun compito aperto.</p>}</div>
        </Card>
        <RecordSection title="Materie" types={["subject"]} empty="Aggiungi le tue materie." />
        <RecordSection title="Esami e verifiche" types={["exam"]} empty="Aggiungi date d'esame e argomenti." limit={10} />
        <RecordSection title="Voti" types={["grade"]} empty="Registra i voti reali." limit={10} />
        <RecordSection title="Registro errori" types={["mistake"]} empty="Ogni errore annotato è un punto in meno la prossima volta." limit={10} />
      </div>

      <ConfirmDialog
        open={planFor != null}
        onOpenChange={(o) => !o && setPlanFor(null)}
        title="Creare il piano di ripasso?"
        confirmLabel={`Crea ${plan.length} attività`}
        onConfirm={createPlan}
        description={
          plan.length === 0 ? (
            "L'esame è troppo vicino per distribuire il ripasso."
          ) : (
            <div>
              <p className="mb-2">Gli argomenti vengono distribuiti nei giorni prima dell'esame; la sera prima resta leggera. Puoi spostare ogni sessione dopo.</p>
              <ul className="max-h-48 overflow-y-auto text-xs">
                {plan.map((p, i) => (
                  <li key={i} className="flex gap-2 py-0.5">
                    <span className="w-20 text-subtle">{formatShort(p.date)}</span>
                    {p.title.replace("Revise:", "Ripasso:").replace("Light full review + early night", "Ripasso leggero generale + a letto presto")}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
      />
    </div>
  );
}

function itReason(r: string) {
  return r
    .replace("High base priority", "Priorità alta")
    .replace(/^Difficulty (\d)\/5$/, "Difficoltà $1/5")
    .replace("Exam today", "Esame oggi")
    .replace(/^Exam in (\d+)d$/, "Esame tra $1 gg")
    .replace(/^Latest grade (\d+)%$/, "Ultimo voto $1%");
}
