import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { History, Play, Timer, Trash2 } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useFocusSessions, useRecentFocusSessions, useTasks } from "@/hooks/data";
import type { FocusKind } from "@/db/schema";
import { deleteFocusSession } from "@/db/repo";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, CardHeader, DomainDot, EmptyState, PageHeader, Segmented, Stat } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { MiniBarChart } from "@/components/charts";
import { useFocus } from "./FocusProvider";
import { SessionView } from "./SessionView";
import { addDays, dateRange, formatDuration, relativeDay, timeOfMs, WEEKDAY_SHORT, weekday } from "@/lib/date";
import { scoreTask } from "@/lib/mission";
import { errorMessage } from "@/lib/utils";

export function FocusPage() {
  const focus = useFocus();
  if (focus.active === undefined) return null;
  // Portal: an ancestor animation uses transform, which would trap a fixed overlay.
  if (focus.active) return createPortal(<SessionView active={focus.active} />, document.body);
  return <FocusHome />;
}

function FocusHome() {
  const { settings, today, domains, domain, tz } = useApp();
  const focus = useFocus();
  const toast = useToast();
  const tasks = useTasks();
  const [params] = useSearchParams();
  const [taskId, setTaskId] = useState<string>(params.get("task") ?? "");
  const [label, setLabel] = useState("");
  const [freeDomain, setFreeDomain] = useState(domains[0]?.id ?? "");
  const [kind, setKind] = useState<FocusKind>(settings.mode === "recovery" ? "pomodoro" : "pomodoro");
  const [custom, setCustom] = useState(String(settings.focusMinutes));
  const [toDelete, setToDelete] = useState<string | null>(null);

  const weekFrom = addDays(today, -6);
  const sessions = useFocusSessions(weekFrom, today);
  const recent = useRecentFocusSessions(25);

  useEffect(() => {
    const t = params.get("task");
    if (t) setTaskId(t);
  }, [params]);

  const openTasks = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => t.status !== "done")
        .sort((a, b) => Number(b.missionDate === today) - Number(a.missionDate === today) || scoreTask(b, today).score - scoreTask(a, today).score),
    [tasks, today],
  );
  const selectedTask = openTasks.find((t) => t.id === taskId);

  const planned = kind === "pomodoro" ? settings.focusMinutes : kind === "long" ? settings.longFocusMinutes : Number(custom);
  const customInvalid = kind === "custom" && (!Number.isInteger(planned) || planned < 1 || planned > 600);
  const finalLabel = selectedTask ? selectedTask.title : label.trim();

  async function start() {
    if (!finalLabel) {
      toast.error("Scegli un'attività o scrivi su cosa stai lavorando.");
      return;
    }
    if (customInvalid) return;
    try {
      await focus.start({ taskId: selectedTask?.id ?? null, label: finalLabel, domain: selectedTask?.domain ?? freeDomain ?? null, kind, plannedMin: planned });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const stats = useMemo(() => {
    const s = sessions ?? [];
    const todayS = s.filter((x) => x.date === today);
    const sum = (xs: typeof s, k: "actualSec" | "pausedSec") => xs.reduce((a, x) => a + x[k], 0) / 60;
    const chart = dateRange(weekFrom, today).map((d) => {
      const day = s.filter((x) => x.date === d);
      return {
        day: d === today ? "Oggi" : WEEKDAY_SHORT[weekday(d)],
        planned: day.reduce((a, x) => a + x.plannedMin, 0),
        actual: Math.round(sum(day, "actualSec")),
      };
    });
    return {
      todayActual: sum(todayS, "actualSec"),
      todayPaused: sum(todayS, "pausedSec"),
      todayPlanned: todayS.reduce((a, x) => a + x.plannedMin, 0),
      todayCount: todayS.length,
      todayDistractions: todayS.reduce((a, x) => a + x.distractions.length, 0),
      weekActual: sum(s, "actualSec"),
      weekCount: s.length,
      completion: s.length ? s.filter((x) => x.outcome === "completed").length / s.length : null,
      chart,
    };
  }, [sessions, today, weekFrom]);

  return (
    <div>
      <PageHeader title="Lavoro profondo" description="Un'attività, un blocco, niente multitasking. Si registra solo il tempo effettivamente concentrato." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <div className="eyebrow mb-4">Nuova sessione</div>
          <div className="flex flex-col gap-4">
            <Field label="Su cosa stai lavorando?">
              {(p) => (
                <Select {...p} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">Altro (scrivi sotto)</option>
                  {openTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.missionDate === today ? "◎ " : ""}
                      {t.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {!selectedTask ? (
              <div className="grid grid-cols-[1fr_140px] gap-3">
                <Field label="Etichetta">
                  {(p) => <Input {...p} value={label} maxLength={140} onChange={(e) => setLabel(e.target.value)} placeholder="es. Ripassare trigonometria" onKeyDown={(e) => e.key === "Enter" && start()} />}
                </Field>
                <Field label="Area">
                  {(p) => (
                    <Select {...p} value={freeDomain} onChange={(e) => setFreeDomain(e.target.value)}>
                      {domains.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            ) : (
              <p className="-mt-1 text-xs text-subtle">
                {selectedTask.actualMin ? `${formatDuration(selectedTask.actualMin)} logged so far` : "Nessun tempo registrato"}
                {selectedTask.estimateMin ? ` · ${formatDuration(selectedTask.estimateMin)} estimated` : ""}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Tipo di sessione</span>
              <Segmented
                label="Tipo di sessione"
                value={kind}
                onChange={setKind}
                className="w-full"
                options={[
                  { value: "pomodoro", label: `Pomodoro · ${settings.focusMinutes}m` },
                  { value: "long", label: `Long · ${settings.longFocusMinutes}m` },
                  { value: "custom", label: "Personalizzato" },
                ]}
              />
              {kind === "custom" ? (
                <div className="mt-1 flex items-center gap-2 text-[13px] text-muted">
                  <Input aria-label="Minuti personalizzati" type="number" min={1} max={600} value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8 w-20" aria-invalid={customInvalid} />
                  minuti {customInvalid ? <span className="text-xs text-danger">1–600</span> : null}
                </div>
              ) : null}
              {kind === "long" && settings.mode === "recovery" ? <p className="text-xs text-ok">Modalità Recupero: oggi di solito sono meglio blocchi più brevi.</p> : null}
            </div>
            <Button variant="primary" size="lg" onClick={start} disabled={customInvalid}>
              <Play /> Inizio {planned && !customInvalid ? `${planned}-minute` : ""} session
            </Button>
            <p className="text-[11px] leading-relaxed text-faint">
              Durante la sessione l'interfaccia diventa minimale. Unbeatable non può bloccare altre app o siti: metti il telefono in un'altra stanza.
              {settings.notifications ? " Riceverai una notifica allo scadere del tempo." : " Attiva le notifiche nelle Impostazioni per essere avvisato allo scadere del tempo."}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Focus · ultimi 7 giorni" icon={<Timer />} />
          <div className="grid grid-cols-3 gap-3 px-4 pb-2">
            <Stat label="Focus oggi" value={formatDuration(stats.todayActual)} sub={`${stats.todayCount} session${stats.todayCount === 1 ? "e" : "i"} · ${formatDuration(stats.todayPlanned)} pianificati`} />
            <Stat label="Interruzioni oggi" value={formatDuration(stats.todayPaused)} sub={`${stats.todayDistractions} distrazion${stats.todayDistractions === 1 ? "e" : "i"} annotat${stats.todayDistractions === 1 ? "a" : "e"}`} />
            <Stat label="Questa settimana" value={formatDuration(stats.weekActual)} sub={stats.completion != null ? `${Math.round(stats.completion * 100)}% ran to plan` : "Nessuna sessione ancora"} />
          </div>
          <div className="px-4 pt-2 pb-4">
            <MiniBarChart
              data={stats.chart}
              xKey="day"
              series={[
                { key: "planned", name: "Pianificato", color: "rgb(255 255 255 / 0.13)" },
                { key: "actual", name: "Effettivamente concentrato", color: "#d4d4d4" },
              ]}
              format={(v) => formatDuration(v)}
            />
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Storico sessioni" icon={<History />} />
        {!recent || recent.length === 0 ? (
          <EmptyState icon={<Timer />} title="Nessuna sessione ancora" description="Le sessioni completate o terminate compaiono qui con il loro tempo reale di concentrazione." />
        ) : (
          <ul className="px-1.5 pb-1.5">
            {recent.map((s) => {
              const d = domain(s.domain);
              return (
                <li key={s.id} className="group flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03]">
                  <DomainDot color={d?.color} className="mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] text-fg">{s.label}</span>
                      {s.outcome === "completed" ? <Badge tone="ok">Completata</Badge> : <Badge>Terminata prima</Badge>}
                      {s.quality ? <span className="text-[11px] text-subtle">Focus {s.quality}/5</span> : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-subtle tabular">
                      {relativeDay(s.date, today)} {timeOfMs(s.startedAt, tz)} · {formatDuration(s.actualSec / 60)} di focus su {formatDuration(s.plannedMin)} pianificati
                      {s.pausedSec >= 60 ? ` · ${formatDuration(s.pausedSec / 60)} in pausa` : ""}
                      {s.distractions.length ? ` · ${s.distractions.length} distrazion${s.distractions.length > 1 ? "i" : "e"}` : ""}
                    </div>
                    {s.notes ? <p className="mt-1 text-xs leading-relaxed text-muted">{s.notes}</p> : null}
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Elimina sessione" className="md:opacity-0 md:group-hover:opacity-100" onClick={() => setToDelete(s.id)}>
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare questa sessione?"
        description="Il suo tempo di focus verrà rimosso dallo storico e dal tempo reale dell'attività collegata."
        confirmLabel="Elimina sessione"
        danger
        onConfirm={async () => {
          if (toDelete) await deleteFocusSession(toDelete);
          toast.info("Sessione eliminata");
        }}
      />
    </div>
  );
}
