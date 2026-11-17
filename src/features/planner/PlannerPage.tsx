import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertTriangle, BedDouble, ChevronLeft, ChevronRight, Plus, Repeat, Utensils } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useEvents, useTasks } from "@/hooks/data";
import type { PlannerEvent, Task } from "@/db/schema";
import { categoryMeta, EVENT_CATEGORIES } from "@/db/defaults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, CardHeader, EmptyState, PageHeader, ProgressBar, Segmented, Skeleton } from "@/components/ui/misc";
import { TaskRow } from "@/features/tasks/TaskRow";
import { EventFormDialog, type EventDialogState } from "./EventFormDialog";
import { findConflicts, layoutColumns, LOAD_COPY, occurrencesOn, sleepIntrusions, workload, type Occurrence, type Workload } from "@/lib/planner";
import { addDays, awakeWindow, dateRange, formatDuration, formatLong, formatShort, minToHm, startOfWeek, WEEKDAY_SHORT, weekday } from "@/lib/date";
import { cn } from "@/lib/utils";

const PX = 1.1; // pixels per minute

export function tasksForDay(tasks: Task[], date: string) {
  return tasks.filter((t) => t.scheduledDate === date || t.missionDate === date);
}

export function PlannerPage() {
  const { today, settings, openTask } = useApp();
  const events = useEvents();
  const tasks = useTasks();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(today);
  const [dialog, setDialog] = useState<EventDialogState>({ open: false, date: today });

  useEffect(() => {
    if (params.get("new") === "1") {
      setDialog({ open: true, date });
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams, date]);

  const step = view === "day" ? 1 : 7;
  const weekStart = startOfWeek(date, settings.weekStart);

  return (
    <div>
      <PageHeader
        title="Planner"
        description="Prima gli impegni, poi il lavoro deliberato. Lascia spazio agli imprevisti: un piano che riempie ogni minuto salta entro mezzogiorno."
        actions={
          <Button variant="primary" onClick={() => setDialog({ open: true, date })}>
            <Plus /> Nuovo blocco
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          label="Vista planner"
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: "Giorno" },
            { value: "week", label: "Settimana" },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Precedente" onClick={() => setDate(addDays(date, -step))}>
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(today)} disabled={view === "day" ? date === today : weekStart === startOfWeek(today, settings.weekStart)}>
            Oggi
          </Button>
          <Button variant="ghost" size="icon" aria-label="Successivo" onClick={() => setDate(addDays(date, step))}>
            <ChevronRight />
          </Button>
        </div>
        <h2 className="text-[15px] font-medium tracking-tight">
          {view === "day" ? formatLong(date) : `${formatShort(weekStart)} – ${formatShort(addDays(weekStart, 6))}`}
        </h2>
        <Input type="date" aria-label="Vai alla data" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="ml-auto h-8 w-auto" />
      </div>

      {!events || !tasks ? (
        <Skeleton className="h-[480px]" />
      ) : view === "day" ? (
        <DayView
          date={date}
          events={events}
          tasks={tasks}
          onCreate={(start) => setDialog({ open: true, date, start })}
          onEdit={(ev) => setDialog({ open: true, date, event: ev })}
          onAddTask={() => openTask(undefined, { scheduledDate: date })}
        />
      ) : (
        <WeekView
          weekStart={weekStart}
          events={events}
          tasks={tasks}
          onOpenDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      )}

      <EventFormDialog state={dialog} onClose={() => setDialog((s) => ({ ...s, open: false }))} />
    </div>
  );
}

function DayView({
  date,
  events,
  tasks,
  onCreate,
  onEdit,
  onAddTask,
}: {
  date: string;
  events: PlannerEvent[];
  tasks: Task[];
  onCreate: (start: number) => void;
  onEdit: (e: PlannerEvent) => void;
  onAddTask: () => void;
}) {
  const { settings, today, nowMin } = useApp();
  const occ = useMemo(() => occurrencesOn(events, date), [events, date]);
  const conflicts = useMemo(() => findConflicts(occ), [occ]);
  const layout = useMemo(() => layoutColumns(occ), [occ]);
  const intrusions = useMemo(() => new Set(sleepIntrusions(occ, settings.wakeTime, settings.bedTime).map((o) => o.key)), [occ, settings.wakeTime, settings.bedTime]);
  const dayTasks = useMemo(() => tasksForDay(tasks, date), [tasks, date]);
  const load = useMemo(() => workload(occ, dayTasks, settings.wakeTime, settings.bedTime), [occ, dayTasks, settings.wakeTime, settings.bedTime]);

  const awake = awakeWindow(settings.wakeTime, settings.bedTime);
  const rangeStart = Math.floor(Math.min(awake.start, ...occ.map((o) => o.start)) / 60) * 60;
  const rangeEnd = Math.min(1440, Math.ceil(Math.max(Math.min(awake.end, 1440), ...occ.map((o) => o.end)) / 60) * 60);
  const hours = [];
  for (let m = rangeStart; m <= rangeEnd; m += 60) hours.push(m);
  const height = (rangeEnd - rangeStart) * PX;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="relative overflow-hidden p-3 pl-0">
        <div
          className="relative ml-14 cursor-copy"
          style={{ height }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const y = e.nativeEvent.offsetY;
            const m = Math.round((rangeStart + y / PX) / 15) * 15;
            onCreate(Math.min(m, 23 * 60));
          }}
          role="grid"
          aria-label={`Programma di ${formatLong(date)}. Clicca uno spazio vuoto per aggiungere un blocco.`}
        >
          {hours.map((m) => (
            <div key={m} className="pointer-events-none absolute right-0 left-0 border-t border-line" style={{ top: (m - rangeStart) * PX }}>
              <span className="absolute -top-2 -left-12 w-10 text-right font-mono text-[10px] text-faint">{minToHm(m)}</span>
            </div>
          ))}
          {/* Sleep shading outside the awake window */}
          {awake.start > rangeStart ? (
            <div className="pointer-events-none absolute right-0 left-0 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.025)_0_6px,transparent_6px_12px)]" style={{ top: 0, height: (awake.start - rangeStart) * PX }} />
          ) : null}
          {awake.end < rangeEnd ? (
            <div className="pointer-events-none absolute right-0 left-0 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.025)_0_6px,transparent_6px_12px)]" style={{ top: (awake.end - rangeStart) * PX, bottom: 0 }} />
          ) : null}
          <SleepMarker label={`Sveglia ${settings.wakeTime}`} top={(awake.start - rangeStart) * PX} />
          {awake.end <= 1440 ? <SleepMarker label={`A letto ${settings.bedTime}`} top={(awake.end - rangeStart) * PX} /> : null}

          {date === today && nowMin >= rangeStart && nowMin <= rangeEnd ? (
            <div className="pointer-events-none absolute right-0 left-0 z-20 flex items-center" style={{ top: (nowMin - rangeStart) * PX }}>
              <span className="-ml-1 size-2 rounded-full bg-accent" />
              <span className="h-px flex-1 bg-accent/70" />
            </div>
          ) : null}

          {occ.map((o) => (
            <Block key={o.key} o={o} top={(o.start - rangeStart) * PX} layout={layout.get(o.key)} conflict={conflicts.keys.has(o.key)} sleep={intrusions.has(o.key)} onClick={() => onEdit(o.event)} />
          ))}
        </div>
        {occ.length === 0 ? (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs text-subtle">Niente in programma. Clicca su un orario per aggiungere un blocco.</p>
        ) : null}
      </Card>

      <div className="flex flex-col gap-5">
        <WorkloadCard load={load} conflicts={conflicts.pairs} intrusions={occ.filter((o) => intrusions.has(o.key))} />
        <Card>
          <CardHeader
            title="Attività di questo giorno"
            action={
              <Button variant="ghost" size="icon-sm" aria-label="Aggiungi attività per questo giorno" onClick={onAddTask}>
                <Plus />
              </Button>
            }
          />
          <div className="px-1.5 pb-1.5">
            {dayTasks.length === 0 ? (
              <p className="px-3 pb-4 text-xs text-subtle">Nessuna attività pianificata. Usa “Pianifica per…” su un'attività o aggiungine una qui.</p>
            ) : (
              dayTasks.map((t) => <TaskRow key={t.id} task={t} compact />)
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SleepMarker({ label, top }: { label: string; top: number }) {
  return (
    <div className="pointer-events-none absolute right-2 z-10 flex items-center gap-1 text-[10px] text-faint" style={{ top: top - 14 }}>
      <BedDouble className="size-3" /> {label}
    </div>
  );
}

function Block({ o, top, layout, conflict, sleep, onClick }: { o: Occurrence; top: number; layout?: { col: number; cols: number }; conflict: boolean; sleep: boolean; onClick: () => void }) {
  const meta = categoryMeta(o.event.category);
  const h = Math.max(18, (o.end - o.start) * PX - 2);
  const cols = layout?.cols ?? 1;
  const col = layout?.col ?? 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute z-10 overflow-hidden rounded-lg border px-2 py-1 text-left transition-[filter] hover:brightness-125 focus-visible:z-30",
        conflict ? "border-danger/60" : sleep ? "border-warn/50" : "border-white/[0.06]",
      )}
      style={{
        top: top + 1,
        height: h,
        left: `calc(${(col / cols) * 100}% + 4px)`,
        width: `calc(${100 / cols}% - 8px)`,
        background: `color-mix(in oklab, ${meta.color} 16%, #0e0e11)`,
        boxShadow: `inset 2px 0 0 ${meta.color}`,
      }}
      title={`${o.event.title} · ${o.event.start}–${o.event.end}${conflict ? " · si sovrappone a un altro blocco" : ""}${sleep ? " · invade le ore di sonno" : ""}`}
    >
      <div className="flex items-center gap-1 truncate text-[12px] font-medium text-fg">
        {conflict ? <AlertTriangle className="size-3 shrink-0 text-danger" /> : null}
        {o.event.repeatDays.length ? <Repeat className="size-3 shrink-0 text-subtle" /> : null}
        <span className="truncate">{o.event.title}</span>
      </div>
      {h > 32 ? (
        <div className="truncate font-mono text-[10px] text-subtle">
          {o.event.start}–{o.event.end} · {meta.label}
        </div>
      ) : null}
    </button>
  );
}

function WorkloadCard({ load, conflicts, intrusions }: { load: Workload; conflicts: [Occurrence, Occurrence][]; intrusions: Occurrence[] }) {
  const tone = load.level === "over" ? "var(--color-danger)" : load.level === "heavy" ? "var(--color-warn)" : "var(--color-ok)";
  const cats = Object.entries(load.byCategory).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return (
    <Card>
      <CardHeader title="Carico di lavoro" sub={`${Math.round(load.ratio * 100)}% delle ore di veglia`} />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <ProgressBar value={load.ratio} color={tone} label="Quota di ore di veglia pianificate" />
        <p className="text-xs leading-relaxed text-muted">{LOAD_COPY[load.level]}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-subtle">Sveglio</dt>
          <dd className="text-right text-fg tabular">{formatDuration(load.awakeMin)}</dd>
          <dt className="text-subtle">Blocchi in programma</dt>
          <dd className="text-right text-fg tabular">{formatDuration(load.committedMin)}</dd>
          <dt className="text-subtle">Stime attività (fuori dai blocchi)</dt>
          <dd className="text-right text-fg tabular">{formatDuration(load.taskMin)}</dd>
          <dt className="text-subtle">Non pianificato</dt>
          <dd className="text-right text-fg tabular">{formatDuration(load.freeMin)}</dd>
        </dl>
        {cats.length ? (
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            {cats.map(([c, m]) => {
              const meta = EVENT_CATEGORIES.find((x) => x.id === c)!;
              return (
                <div key={c} className="flex items-center gap-2 text-[11px]">
                  <span className="size-2 rounded-sm" style={{ background: meta.color }} />
                  <span className="text-subtle">{meta.label}</span>
                  <span className="ml-auto text-muted tabular">{formatDuration(m ?? 0)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        {conflicts.length || intrusions.length || load.unestimatedTasks || (!load.hasMeals && load.committedMin > 0) ? (
          <ul className="flex flex-col gap-1.5 border-t border-line pt-3 text-xs">
            {conflicts.map(([a, b]) => (
              <li key={a.key + b.key} className="flex gap-2 text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  “{a.event.title}” si sovrappone a “{b.event.title}”
                </span>
              </li>
            ))}
            {intrusions.map((o) => (
              <li key={o.key} className="flex gap-2 text-warn">
                <BedDouble className="mt-0.5 size-3.5 shrink-0" />
                <span>“{o.event.title}” è fuori dalle tue ore di veglia.</span>
              </li>
            ))}
            {load.unestimatedTasks ? (
              <li className="flex gap-2 text-subtle">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {load.unestimatedTasks} attività senza stima: il carico potrebbe essere maggiore.
                </span>
              </li>
            ) : null}
            {!load.hasMeals && load.committedMin > 0 ? (
              <li className="flex gap-2 text-subtle">
                <Utensils className="mt-0.5 size-3.5 shrink-0" />
                <span>Nessun pasto pianificato, ma richiedono comunque tempo. Tieni libera circa 1,5 h.</span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

function WeekView({ weekStart, events, tasks, onOpenDay }: { weekStart: string; events: PlannerEvent[]; tasks: Task[]; onOpenDay: (d: string) => void }) {
  const { settings, today } = useApp();
  const days = dateRange(weekStart, addDays(weekStart, 6));
  const data = days.map((d) => {
    const occ = occurrencesOn(events, d);
    return { date: d, occ, conflicts: findConflicts(occ).pairs.length, load: workload(occ, tasksForDay(tasks, d), settings.wakeTime, settings.bedTime) };
  });
  const totalCommitted = data.reduce((s, x) => s + x.load.committedMin, 0);
  if (!events.length && !tasks.some((t) => t.scheduledDate && t.scheduledDate >= weekStart)) {
    return (
      <Card>
        <EmptyState title="Una settimana vuota" description="Aggiungi gli impegni fissi — scuola, allenamenti, preghiera, studio — come blocchi settimanali. Compariranno qui ogni settimana." />
      </Card>
    );
  }
  return (
    <div>
      <p className="mb-3 text-xs text-subtle">{formatDuration(totalCommitted)} in programma questa settimana. Clicca un giorno per aprirlo.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {data.map(({ date, occ, conflicts, load }) => {
          const tone = load.level === "over" ? "var(--color-danger)" : load.level === "heavy" ? "var(--color-warn)" : "var(--color-ok)";
          return (
            <button
              key={date}
              onClick={() => onOpenDay(date)}
              className={cn("card flex min-h-48 flex-col p-2.5 text-left transition-colors hover:border-line-strong", date === today && "border-accent/40")}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className={cn("text-xs font-medium", date === today ? "text-accent" : "text-fg")}>{WEEKDAY_SHORT[weekday(date)]}</span>
                <span className="text-[11px] text-faint">{date.slice(8)}</span>
              </div>
              <ProgressBar value={load.ratio} color={tone} className="mb-2 h-1" label={`Carico ${WEEKDAY_SHORT[weekday(date)]}`} />
              <ul className="flex flex-1 flex-col gap-1">
                {occ.slice(0, 7).map((o) => (
                  <li key={o.key} className="truncate rounded-md px-1.5 py-1 text-[11px] text-muted" style={{ background: `color-mix(in oklab, ${categoryMeta(o.event.category).color} 12%, transparent)` }}>
                    <span className="font-mono text-[10px] text-subtle">{o.event.start}</span> {o.event.title}
                  </li>
                ))}
                {occ.length > 7 ? <li className="px-1.5 text-[10px] text-faint">+{occ.length - 7} altri</li> : null}
              </ul>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-faint">
                {load.taskCount ? <span>{load.taskCount} attività</span> : null}
                {conflicts ? (
                  <span className="flex items-center gap-1 text-danger">
                    <AlertTriangle className="size-3" /> {conflicts}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
