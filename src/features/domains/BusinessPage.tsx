import { useMemo, useState } from "react";
import { ArrowRightLeft, Plus, Rocket, Wallet } from "lucide-react";
import { useApp } from "@/hooks/app";
import { QuoteCard } from "@/components/QuoteCard";
import { useTasks } from "@/hooks/data";
import { RecordSection, useRecords } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Card, CardHeader, PageHeader, Segmented } from "@/components/ui/misc";
import { TaskRow } from "@/features/tasks/TaskRow";
import { RECORD_TYPES } from "@/db/records";
import { businessMetrics } from "@/lib/domains";
import { addDays } from "@/lib/date";

export function BusinessPage() {
  const { today, openTask } = useApp();
  const records = useRecords(["project", "activity", "outcome", "transaction"]);
  const tasks = useTasks();
  const [range, setRange] = useState<"7" | "30" | "365">("30");
  const [project, setProject] = useState("");
  const projects = (records ?? []).filter((r) => r.type === "project");
  const m = useMemo(() => businessMetrics(records ?? [], addDays(today, -(Number(range) - 1)), today, project || undefined), [records, today, range, project]);
  const label = (type: string, k: string) => RECORD_TYPES[type].fields.find((f) => f.key === "kind")!.options!.find((o) => o.value === k)?.label ?? k;
  const bizTasks = (tasks ?? []).filter((t) => t.domain === "business" && t.status !== "done").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));

  return (
    <div>
      <PageHeader
        title="Business"
        description="Sostituisci l'ambizione vaga con esecuzione misurabile. Le attività (input) sono separate dai risultati (output); i ricavi sono solo transazioni reali registrate."
      />
      <QuoteCard areas={["business"]} className="mb-5" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented
          label="Periodo"
          value={range}
          onChange={setRange}
          options={[
            { value: "7", label: "7 giorni" },
            { value: "30", label: "30 giorni" },
            { value: "365", label: "12 mesi" },
          ]}
        />
        <Select aria-label="Progetto" value={project} onChange={(e) => setProject(e.target.value)} className="h-8 w-auto text-xs">
          <option value="">Tutti i progetti</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {String(p.data.name)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <MetricCard title="Attività · input" icon={<ArrowRightLeft />} entries={[...m.activity].map(([k, v]) => [label("activity", k), v])} empty="Nessuna attività registrata nel periodo." />
        <MetricCard title="Risultati · output" icon={<Rocket />} entries={[...m.outcomes].map(([k, v]) => [label("outcome", k), v])} empty="Nessun risultato registrato nel periodo." />
        <Card>
          <CardHeader title="Denaro reale" icon={<Wallet />} sub="solo transazioni registrate" />
          <div className="px-4 pb-4">
            {m.money.size === 0 ? (
              <p className="text-xs text-subtle">Nessuna transazione nel periodo. Le stime e le proiezioni non vengono mai mostrate come entrate.</p>
            ) : (
              [...m.money].map(([cur, v]) => (
                <dl key={cur} className="mb-3 grid grid-cols-2 gap-y-1 text-[13px] last:mb-0">
                  <dt className="text-subtle">Entrate</dt>
                  <dd className="text-right text-fg tabular">{v.income.toFixed(2)} {cur}</dd>
                  <dt className="text-subtle">Spese</dt>
                  <dd className="text-right text-fg tabular">−{v.expense.toFixed(2)} {cur}</dd>
                  <dt className="font-medium text-muted">Netto</dt>
                  <dd className={`text-right font-medium tabular ${v.income - v.expense < 0 ? "text-danger" : "text-ok"}`}>
                    {(v.income - v.expense).toFixed(2)} {cur}
                  </dd>
                </dl>
              ))
            )}
          </div>
        </Card>
      </div>
      {m.activity.get("outreach") && m.outcomes.get("meetingBooked") ? (
        <p className="mt-3 text-xs text-subtle">
          Osservazione: {m.activity.get("outreach")} contatti → {m.outcomes.get("meetingBooked")} incontri fissati ({Math.round((m.outcomes.get("meetingBooked")! / m.activity.get("outreach")!) * 100)}%).
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Attività e scadenze"
            action={
              <Button size="sm" variant="ghost" onClick={() => openTask(undefined, { domain: "business" })}>
                <Plus /> Attività
              </Button>
            }
          />
          <div className="px-1.5 pb-1.5">{bizTasks.length ? bizTasks.slice(0, 8).map((t) => <TaskRow key={t.id} task={t} compact />) : <p className="px-3 pb-3 text-xs text-subtle">Nessuna attività aperta nell'area Business.</p>}</div>
        </Card>
        <RecordSection title="Progetti" types={["project"]} empty="Crea un progetto con un obiettivo misurabile." />
        <RecordSection title="Registro attività e risultati" types={["activity", "outcome"]} empty="Registra cosa hai fatto (input) e cosa è successo (output)." limit={12} defaults={project ? { projectId: project } : undefined} />
        <RecordSection title="Transazioni" types={["transaction"]} empty="Registra solo soldi effettivamente ricevuti o spesi." limit={12} defaults={project ? { projectId: project } : undefined} />
        <RecordSection title="Customer discovery" types={["discovery"]} empty="Annota conversazioni con potenziali clienti (usa il ruolo, non il nome completo)." limit={8} />
        <RecordSection title="Revisioni settimanali" types={["bizReview"]} empty="Cosa ha funzionato, cosa no, perché, cosa cambia." limit={6} />
      </div>
    </div>
  );
}

function MetricCard({ title, icon, entries, empty }: { title: string; icon: React.ReactNode; entries: [string, number][]; empty: string }) {
  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      <div className="px-4 pb-4">
        {entries.length === 0 ? (
          <p className="text-xs text-subtle">{empty}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.map(([k, v]) => (
              <li key={k} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-muted">{k}</span>
                <span className="font-medium text-fg tabular">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
