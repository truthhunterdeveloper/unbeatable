import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Archive, ArchiveRestore, Pencil, Plus, Repeat2, RotateCcw } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useAllHabitLogs, useHabits, useModeOf } from "@/hooks/data";
import type { Habit } from "@/db/schema";
import { archiveHabit } from "@/db/repo";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, DomainDot, EmptyState, PageHeader, Skeleton, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { HabitFormDialog } from "./HabitFormDialog";
import { HabitCheckRow } from "./HabitCheckRow";
import { dayCompletion, dayState, describeFrequency, habitStats, overallConsistency, scheduledOn, type DayState, type LogMap, type ModeOf } from "@/lib/habits";
import { addDays, daysBetween, formatShort, relativeDay, startOfWeek } from "@/lib/date";
import { cn, errorMessage, pct } from "@/lib/utils";

export function HabitsPage() {
  const { today, settings, domain } = useApp();
  const toast = useToast();
  const habits = useHabits();
  const { byHabit } = useAllHabitLogs();
  const modeOf = useModeOf(settings.mode);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Habit | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1") {
      setEditing(undefined);
      setFormOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const active = useMemo(() => (habits ?? []).filter((h) => !h.archived), [habits]);
  const archived = useMemo(() => (habits ?? []).filter((h) => h.archived), [habits]);
  const todays = useMemo(() => {
    const tierRank = { essential: 0, standard: 1, optional: 2 };
    return active.filter((h) => scheduledOn(h, today)).sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || a.order - b.order);
  }, [active, today]);

  const loading = !habits || !byHabit;
  const empty = new Map() as LogMap;

  const summary = useMemo(() => {
    if (!byHabit) return null;
    const todayC = dayCompletion(active, byHabit, today, modeOf);
    const week = overallConsistency(active, byHabit, addDays(today, -6), today, today, modeOf);
    const month = overallConsistency(active, byHabit, addDays(today, -29), today, today, modeOf);
    let misses = 0;
    let recoveries = 0;
    for (const h of active) {
      const s = habitStats(h, byHabit.get(h.id) ?? new Map(), addDays(today, -89), today, today, modeOf);
      misses += s.misses;
      recoveries += s.recoveries;
    }
    return { todayC, week, month, misses, recoveries };
  }, [active, byHabit, today, modeOf]);

  const openNew = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (h: Habit) => {
    setEditing(h);
    setFormOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Abitudini"
        description="Costanza prima dell'intensità. L'impegno parziale conta, i giorni giustificati non pesano e un giorno saltato non cancella mai i tuoi progressi."
        actions={
          <Button variant="primary" onClick={openNew}>
            <Plus /> Nuova abitudine
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : active.length === 0 && archived.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Repeat2 />}
            title="Nessuna abitudine ancora"
            description="Inizia con due o tre che riesci a mantenere anche nel giorno più difficile. Potrai aggiungerne altre quando saranno automatiche."
            action={
              <Button variant="primary" size="sm" onClick={openNew}>
                <Plus /> Crea la tua prima abitudine
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {summary ? (
            <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Stat
                label="Oggi"
                value={summary.todayC.expected ? `${Math.floor(summary.todayC.credit)}/${summary.todayC.expected}` : "—"}
                sub={summary.todayC.bonus ? `+${summary.todayC.bonus} bonus` : settings.mode === "recovery" ? "Solo l'essenziale" : "Abitudini previste"}
              />
              <Stat label="Costanza 7 giorni" value={pct(summary.week.rate)} sub="Credito ÷ previsto" />
              <Stat label="Costanza 30 giorni" value={pct(summary.month.rate)} sub="Giorni giustificati esclusi" />
              <Stat
                label="Tasso di ripresa"
                value={summary.misses ? pct(summary.recoveries / summary.misses) : "—"}
                sub={summary.misses ? `${summary.recoveries} su ${summary.misses} mancanze recuperate subito dopo` : "Nessuna mancanza in 90 giorni"}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Check-in di oggi" sub={formatShort(today)} />
            <div className="px-1.5 pb-1.5">
              {todays.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-subtle">Nessuna abitudine prevista oggi.</p>
              ) : (
                todays.map((h) => <HabitCheckRow key={h.id} habit={h} log={byHabit!.get(h.id)?.get(today)} logs={byHabit!.get(h.id) ?? empty} mode={modeOf(today)} date={today} />)
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {active.map((h) => (
              <HabitCard key={h.id} habit={h} logs={byHabit!.get(h.id) ?? empty} modeOf={modeOf} today={today} weekStart={settings.weekStart} color={domain(h.domain)?.color} domainLabel={domain(h.domain)?.label} onEdit={() => openEdit(h)} />
            ))}
          </div>

          {archived.length ? (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowArchived((s) => !s)}>
                <Archive /> {showArchived ? "Hide" : "Show"} archived ({archived.length})
              </Button>
              {showArchived ? (
                <Card className="mt-2 p-1.5">
                  {archived.map((h) => (
                    <div key={h.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.03]">
                      <DomainDot color={domain(h.domain)?.color} />
                      <span className="flex-1 truncate text-[13px] text-muted">{h.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(h)}>
                        <Pencil /> Modifica
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          archiveHabit(h.id, false)
                            .then(() => toast.success("Abitudine ripristinata"))
                            .catch((e) => toast.error(errorMessage(e)))
                        }
                      >
                        <ArchiveRestore /> Ripristina
                      </Button>
                    </div>
                  ))}
                </Card>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <HabitFormDialog open={formOpen} onOpenChange={setFormOpen} habit={editing} />
    </div>
  );
}

function HabitCard({
  habit: h,
  logs,
  modeOf,
  today,
  weekStart,
  color,
  domainLabel,
  onEdit,
}: {
  habit: Habit;
  logs: LogMap;
  modeOf: ModeOf;
  today: string;
  weekStart: 0 | 1;
  color?: string;
  domainLabel?: string;
  onEdit: () => void;
}) {
  const week = habitStats(h, logs, addDays(today, -6), today, today, modeOf);
  const month = habitStats(h, logs, addDays(today, -29), today, today, modeOf);
  const recent = habitStats(h, logs, addDays(today, -13), today, today, modeOf);
  const unit = month.streakUnit === "week" ? "wk" : "d";

  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 px-4 pt-4">
        <DomainDot color={color} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-medium text-fg">{h.name}</h3>
            {h.tier === "essential" ? <Badge tone="accent">Essenziale</Badge> : h.tier === "optional" ? <Badge>Facoltativo</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-subtle">
            {domainLabel} · {describeFrequency(h)}
            {h.target > 1 ? ` · ${h.target} ${h.unit}` : ""}
            {h.reminderTime ? ` · reminder ${h.reminderTime}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Modifica ${h.name}`} onClick={onEdit}>
          <Pencil />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3 px-4 pt-4">
        <Stat label="7 giorni" value={h.tier === "optional" ? `${week.completedDays}d` : pct(week.rate)} />
        <Stat label="30 giorni" value={h.tier === "optional" ? `${month.completedDays}d` : pct(month.rate)} />
        <Stat label="Serie" value={`${month.currentStreak}${unit}`} sub={`best ${month.bestStreak}${unit}`} />
        <Stat
          label="Ripresa"
          value={month.misses ? `${month.recoveries}/${month.misses}` : "—"}
          sub={month.misses ? "riprese" : "nessuna mancanza"}
        />
      </div>

      <div className="px-4 pt-4 pb-3">
        <Heatmap habit={h} logs={logs} modeOf={modeOf} today={today} weekStart={weekStart} color={color} />
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line px-4 py-2.5 text-[11px] text-subtle">
        {recent.missed.length ? (
          <>
            <RotateCcw className="size-3" />
            <span className="truncate">
              Saltata {h.frequency.type === "weekly" ? "la settimana del " : ""}
              {recent.missed
                .slice(-3)
                .map((d) => relativeDay(d, today))
                .join(", ")}
              . Mai saltare due volte: la prossima conta di più.
            </span>
          </>
        ) : (
          <span>{month.expected > 0 ? "Nessuna mancanza nelle ultime due settimane." : h.tier === "optional" ? "Facoltativa: ogni completamento è un bonus." : "Lo storico si costruisce con i check-in."}</span>
        )}
      </div>
    </Card>
  );
}

const STATE_CLASS: Record<DayState, string> = {
  done: "",
  partial: "",
  missed: "bg-white/[0.09]",
  excused: "bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.12)_0_2px,transparent_2px_4px)]",
  "not-required": "bg-white/[0.025]",
  pending: "bg-white/[0.04] ring-1 ring-white/25 ring-inset",
  upcoming: "bg-transparent",
  open: "bg-white/[0.04]",
  off: "bg-transparent",
};

const STATE_LABEL: Record<DayState, string> = {
  done: "Fatto",
  partial: "Parziale",
  missed: "Mancata",
  excused: "Giustificata",
  "not-required": "Non richiesta",
  pending: "Oggi",
  upcoming: "In arrivo",
  open: "Nessuna registrazione",
  off: "Non prevista",
};

function Heatmap({ habit, logs, modeOf, today, weekStart, color }: { habit: Habit; logs: LogMap; modeOf: ModeOf; today: string; weekStart: 0 | 1; color?: string }) {
  const thisWeek = startOfWeek(today, weekStart);
  const firstWeek = startOfWeek(habit.startDate, weekStart);
  const weeks = Math.max(4, Math.min(16, Math.floor(daysBetween(firstWeek, thisWeek) / 7) + 1));
  const start = addDays(thisWeek, -(weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="flex gap-[3px] overflow-x-auto" role="img" aria-label={`${habit.name}: last ${weeks} weeks of history`}>
      {cols.map((col, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {col.map((date) => {
            const log = logs.get(date);
            const st = dayState(habit, date, log, modeOf(date), today);
            const credit = log && !log.excused ? Math.min(1, log.value / habit.target) : 0;
            const style = st === "done" || st === "partial" ? { background: color ?? "#ededef", opacity: st === "partial" ? 0.35 + credit * 0.4 : 0.9 } : undefined;
            return (
              <div
                key={date}
                title={`${formatShort(date)} · ${STATE_LABEL[st]}${st === "partial" ? ` (${log!.value}/${habit.target})` : ""}`}
                className={cn("size-3.5 rounded-[3px]", STATE_CLASS[st])}
                style={style}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
