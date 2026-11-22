import type { FocusSession, Habit, PlannerEvent, SleepLog, Task } from "@/db/schema";
import type { LogMap, ModeOf } from "@/lib/habits";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, ArrowRight, Flag, Gauge, BedDouble, CalendarDays, CheckCircle2, Clock, Play, Plus, Repeat2, Sparkles, Target, Timer, TrendingUp } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useAllHabitLogs, useEvents, useFocusSessions, useHabits, useModeOf, useSleepLogs, useTasks } from "@/hooks/data";
import { useFocus } from "@/features/focus/FocusProvider";
import { MODE_ICON, MODE_COLOR } from "@/components/layout/ModeSwitcher";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, CheckButton, ProgressBar, Ring, Skeleton, Stat } from "@/components/ui/misc";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { goalProgress } from "@/lib/domains";
import { weekScore } from "@/lib/analytics";
import { EveningReflection } from "@/features/domains/PersonalPage";
import { AyahCard, QuoteCard } from "@/components/QuoteCard";
import { BlockChecks } from "./BlockChecks";
import { PrayerCard } from "@/features/domains/PrayerCard";
import type { QuoteArea } from "@/lib/quotes";
import { MiniBarChart } from "@/components/charts";
import { TaskRow, useTaskActions } from "@/features/tasks/TaskRow";
import { HabitCheckRow } from "@/features/habits/HabitCheckRow";
import { tasksForDay } from "@/features/planner/PlannerPage";
import { MODE_COPY, missionTasks, suggestMission } from "@/lib/mission";
import { dayCompletion, scheduledOn } from "@/lib/habits";
import { findConflicts, occurrencesOn, workload } from "@/lib/planner";
import { categoryMeta } from "@/db/defaults";
import { addDays, dateOfMs, dateRange, startOfWeek, formatClock, formatDuration, formatLong, greetingFor, relativeDay, sleepMinutes, timeOfMs, WEEKDAY_SHORT, weekday } from "@/lib/date";
import { remainingMs } from "@/lib/focus";
import { MAX_MISSION } from "@/db/repo";
import { cn, pct } from "@/lib/utils";

export function CommandCenter() {
  const { settings, today, nowMin } = useApp();
  const tasks = useTasks();
  const events = useEvents();
  const habits = useHabits();
  const { byHabit } = useAllHabitLogs();
  const modeOf = useModeOf(settings.mode);
  const week = addDays(today, -6);
  const sessions = useFocusSessions(week, today);
  const sleeps = useSleepLogs(week, today);
  const ModeIcon = MODE_ICON[settings.mode];

  const loading = !tasks || !events || !habits || !byHabit || !sessions || !sleeps;

  return (
    <div>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-subtle">{formatLong(today)}</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">
            {greetingFor(nowMin)}, {settings.name}.
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.015] px-3 py-2">
          <ModeIcon className={cn("size-4", MODE_COLOR[settings.mode])} />
          <div>
            <div className="text-xs font-medium text-fg">Modalità {MODE_COPY[settings.mode].label}</div>
            <div className="max-w-64 text-[11px] text-subtle">{MODE_COPY[settings.mode].missionHint}</div>
          </div>
        </div>
      </header>

      <BlockChecks />
      <PrayerCard className="mb-3" />
      <AyahCard className="mb-3" />
      <QuoteCard
        className="mb-5"
        rotate
        areas={["comeback", "discipline", ...settings.domains.filter((d) => d.enabled && ["deen", "football", "business", "school", "personal"].includes(d.id)).map((d) => d.id as QuoteArea)]}
      />

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <Board tasks={tasks} events={events} habits={habits} byHabit={byHabit} sessions={sessions} sleeps={sleeps} modeOf={modeOf} week={week} />
      )}
    </div>
  );
}

type BoardProps = {
  tasks: Task[];
  events: PlannerEvent[];
  habits: Habit[];
  byHabit: Map<string, LogMap>;
  sessions: FocusSession[];
  sleeps: SleepLog[];
  modeOf: ModeOf;
  week: string;
};

/**
 * Cards are plain functions called during Board's render (not nested component
 * types), so data updates never remount them. Hook order is fixed.
 */
function Board({ tasks, events, habits, byHabit, sessions, sleeps, modeOf, week }: BoardProps) {
  const { settings, today, nowMin } = useApp();
  const goals = useLiveQuery(() => db.goals.where("status").equals("active").toArray(), []);
  return (
    <div className="stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {MissionCard({ className: "md:col-span-2" })}
      {FocusCard()}
      {ScheduleCard({})}
      {HabitsCard()}
      {AdjustCard()}
      {GoalsCard({ className: "md:col-span-2 xl:col-span-1" })}
      {ScoreMini()}
      {nowMin >= 17 * 60 ? <EveningReflection compact /> : null}
      {TrendCard({ className: "md:col-span-2" })}
      {UpcomingCard({ className: "md:col-span-2" })}
      {RecoveryCard()}
      {RecentCard()}
    </div>
  );

  function MissionCard({ className }: { className?: string }) {
    const { openTask, domain } = useApp();
    const actions = useTaskActions();
    const mission = missionTasks(tasks!, today);
    const suggestions = suggestMission(tasks!, today, settings.mode, MAX_MISSION - mission.length);
    const done = mission.filter((t) => t.status === "done").length;
    return (
      <Card className={cn("relative overflow-hidden", className)}>
        <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/[0.06] blur-3xl" />
        <CardHeader
          title="Missione di oggi"
          icon={<Target />}
          sub={mission.length ? `${done} di ${mission.length} completate` : undefined}
          action={
            mission.length < MAX_MISSION ? (
              <Button size="sm" variant="ghost" onClick={() => openTask(undefined, { missionDate: today, scheduledDate: today, important: true })}>
                <Plus /> Aggiungi
              </Button>
            ) : null
          }
        />
        <div className="px-2 pb-2">
          {mission.length === 0 ? (
            <div className="px-3 pt-1 pb-3">
              <p className="text-[15px] font-medium text-fg">Quali sono le tre cose che renderebbero oggi un successo?</p>
              <p className="mt-1 text-xs text-subtle">Scegli tra i suggerimenti o aggiungine di tue. Al massimo tre: tutto il resto resta in Attività.</p>
            </div>
          ) : (
            <ol className="flex flex-col">
              {mission.map((t, i) => {
                const d = domain(t.domain);
                const isDone = t.status === "done";
                return (
                  <li key={t.id} className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/[0.03]">
                    <span className="w-4 font-mono text-xs text-faint">{i + 1}</span>
                    <CheckButton checked={isDone} onChange={() => actions.toggle(t)} label={isDone ? `Reopen ${t.title}` : `Complete ${t.title}`} color={d?.color} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => openTask(t)}>
                      <span className={cn("block truncate text-[15px] font-medium", isDone ? "text-subtle line-through decoration-white/20" : "text-fg")}>{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-subtle [&>span]:whitespace-nowrap">
                        <span className="size-1.5 rounded-full" style={{ background: d?.color }} />
                        {d?.label}
                        {t.estimateMin ? <span>· {formatDuration(t.estimateMin)}</span> : null}
                        {t.actualMin ? <span>· {formatDuration(t.actualMin)} fatti</span> : null}
                        {t.dueDate ? <span className={t.dueDate < today && !isDone ? "text-danger" : ""}>· scade {lowerRel(relativeDay(t.dueDate, today))}</span> : null}
                      </span>
                    </button>
                    {!isDone ? (
                      <Button size="sm" variant="secondary" onClick={() => actions.focus(t)}>
                        <Play /> Focus
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
          {suggestions.length ? (
            <div className="mt-1 border-t border-line px-1 pt-2">
              <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] text-faint">
                <Sparkles className="size-3" /> Suggerite — ordinate per importanza, urgenza e scadenza
              </div>
              {suggestions.map((s) => (
                <div key={s.task.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                  <span className="size-1.5 rounded-full" style={{ background: domain(s.task.domain)?.color }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{s.task.title}</span>
                  <span className="hidden gap-1 sm:flex">
                    {s.reasons.slice(0, 2).map((r) => (
                      <Badge key={r} tone={r === "In ritardo" ? "danger" : "neutral"}>
                        {r}
                      </Badge>
                    ))}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => actions.toggleMission(s.task)}>
                    <Plus /> Aggiungi
                  </Button>
                </div>
              ))}
            </div>
          ) : mission.length === 0 ? (
            <div className="px-3 pb-2">
              <Button size="sm" variant="primary" onClick={() => openTask(undefined, { missionDate: today, scheduledDate: today, important: true })}>
                <Plus /> Aggiungi un'attività alla missione
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    );
  }

  function FocusCard() {
    const focus = useFocus();
    const navigate = useNavigate();
    const actual = sessions!.filter((s) => s.date === today).reduce((a, s) => a + s.actualSec, 0) / 60;
    const next = missionTasks(tasks!, today).find((t) => t.status !== "done") ?? suggestMission(tasks!, today, settings.mode, 1)[0]?.task;
    const a = focus.active;
    return (
      <Card className="flex flex-col">
        <CardHeader title={a ? "Sessione attiva" : "Prossimo focus"} icon={<Timer />} />
        <div className="flex flex-1 flex-col px-4 pb-4">
          {a ? (
            <>
              <p className="truncate text-[15px] font-medium">{a.phase === "break" ? "Break" : a.label}</p>
              <p className="mt-3 font-mono text-4xl font-light tracking-tight tabular">{a.phase === "review" ? "Fatto" : formatClock(remainingMs(a, focus.now))}</p>
              <p className="mt-1 text-xs text-subtle">{a.phase === "review" ? "Rivedi e salva la sessione" : a.phase === "break" ? "Pausa rimanente" : a.runningSince == null ? "In pausa" : "Rimanente"}</p>
              <Button variant="primary" className="mt-auto" onClick={() => navigate("/focus")}>
                Apri sessione <ArrowRight />
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-subtle">Suggerito</p>
              <p className="mt-1 line-clamp-2 text-[15px] font-medium">{next ? next.title : "Niente in coda: aggiungi un'attività alla missione."}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Focus oggi" value={formatDuration(actual)} />
                <Stat label="Durata blocco" value={`${settings.focusMinutes}m`} />
              </div>
              <Button variant="primary" className="mt-auto" onClick={() => navigate(next ? `/focus?task=${next.id}` : "/focus")}>
                <Play /> Avvia focus
              </Button>
            </>
          )}
        </div>
      </Card>
    );
  }

  function ScheduleCard({ className }: { className?: string }) {
    const occ = occurrencesOn(events!, today);
    const conflicts = findConflicts(occ).keys;
    return (
      <Card className={className}>
        <CardHeader
          title="Programma di oggi"
          icon={<CalendarDays />}
          action={
            <Link to="/planner" className="text-[11px] text-subtle hover:text-fg">
              Planner →
            </Link>
          }
        />
        <ul className="px-4 pb-4">
          {occ.length === 0 ? <li className="py-4 text-xs text-subtle">Nessun blocco oggi. Aggiungi impegni nel planner.</li> : null}
          {occ.map((o) => {
            const past = o.end <= nowMin;
            const now = o.start <= nowMin && nowMin < o.end;
            return (
              <li key={o.key} className={cn("flex items-center gap-3 border-l py-1.5 pl-3", now ? "border-accent" : "border-line", past && "opacity-45")}>
                <span className="w-11 font-mono text-[11px] text-subtle tabular">{o.event.start}</span>
                <span className="size-1.5 rounded-full" style={{ background: categoryMeta(o.event.category).color }} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{o.event.title}</span>
                {now ? <Badge tone="accent">Ora</Badge> : null}
                {conflicts.has(o.key) ? <AlertTriangle className="size-3.5 text-danger" aria-label="Conflitto" /> : null}
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  function HabitsCard() {
    const active = habits!.filter((h) => !h.archived);
    const todays = active.filter((h) => scheduledOn(h, today));
    const c = dayCompletion(active, byHabit!, today, modeOf);
    return (
      <Card>
        <CardHeader
          title="Abitudini di oggi"
          icon={<Repeat2 />}
          action={
            <Link to="/habits" className="text-[11px] text-subtle hover:text-fg">
              Tutte →
            </Link>
          }
        />
        <div className="flex items-center gap-4 px-4 pb-2">
          <Ring value={c.rate ?? 0} size={46} label={`Completamento abitudini ${pct(c.rate)}`}>
            <span className="text-[11px] font-medium tabular">{c.expected ? Math.round((c.rate ?? 0) * 100) : "—"}</span>
          </Ring>
          <div className="text-xs text-subtle">
            <span className="text-fg tabular">{Math.floor(c.credit)}</span> di {c.expected} previste
            {c.bonus ? ` · +${c.bonus} bonus` : ""}
            {settings.mode === "recovery" ? <div className="text-ok">Recupero: solo l'essenziale</div> : null}
          </div>
        </div>
        <div className="px-1.5 pb-1.5">
          {todays.length === 0 ? <p className="px-3 pb-3 text-xs text-subtle">Nessuna abitudine prevista oggi.</p> : null}
          {todays.slice(0, 6).map((h) => (
            <HabitCheckRow key={h.id} habit={h} log={byHabit!.get(h.id)?.get(today)} logs={byHabit!.get(h.id) ?? new Map()} mode={modeOf(today)} date={today} compact />
          ))}
        </div>
      </Card>
    );
  }

  function AdjustCard() {
    const items: { tone: "danger" | "warn" | "neutral"; text: string; to?: string }[] = [];
    const overdue = tasks!.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today);
    if (overdue.length) items.push({ tone: "danger", text: `${overdue.length} attività in ritardo — ripianifica, falla o eliminala.`, to: "/tasks" });
    const occ = occurrencesOn(events!, today);
    const conf = findConflicts(occ).pairs.length;
    if (conf) items.push({ tone: "danger", text: `${conf} scheduling conflict${conf > 1 ? "s" : ""} today.`, to: "/planner" });
    const load = workload(occ, tasksForDay(tasks!, today), settings.wakeTime, settings.bedTime);
    if (load.level === "over" || load.level === "heavy") items.push({ tone: "warn", text: `Oggi è ${load.level === "over" ? "sovraccarica" : "pesante"}: ${Math.round(load.ratio * 100)}% delle ore di veglia pianificate.`, to: "/planner" });
    const last = sleeps!.find((s) => s.date === today);
    if (last && sleepMinutes(last.bedTime, last.wakeTime) < 480) items.push({ tone: "warn", text: `Hai dormito ${formatDuration(sleepMinutes(last.bedTime, last.wakeTime))} stanotte — proteggi l'orario di stasera.` });
    const yesterday = addDays(today, -1);
    const missedY = habits!.filter((h) => !h.archived && h.frequency.type !== "weekly").filter((h) => {
      const cY = dayCompletion([h], byHabit!, yesterday, modeOf);
      return cY.expected > 0 && cY.credit === 0;
    });
    if (missedY.length) items.push({ tone: "neutral", text: `Saltate ieri: ${missedY.map((h) => h.name).slice(0, 3).join(", ")}. Mai saltare due volte di fila.`, to: "/habits" });
    const navigate = useNavigate();
    return (
      <Card>
        <CardHeader title="Da sistemare" icon={<AlertTriangle />} />
        <ul className="flex flex-col gap-1 px-2 pb-3">
          {items.length === 0 ? (
            <li className="flex items-center gap-2 px-2 py-2 text-xs text-subtle">
              <CheckCircle2 className="size-4 text-ok" /> Niente da segnalare. Esegui il piano.
            </li>
          ) : (
            items.map((it, i) => (
              <li key={i}>
                <button
                  onClick={() => it.to && navigate(it.to)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted hover:bg-white/[0.03]"
                >
                  <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", it.tone === "danger" ? "bg-danger" : it.tone === "warn" ? "bg-warn" : "bg-subtle")} />
                  {it.text}
                </button>
              </li>
            ))
          )}
        </ul>
      </Card>
    );
  }

  function TrendCard({ className }: { className?: string }) {
    const days = dateRange(week, today);
    const active = habits!.filter((h) => !h.archived);
    const data = days.map((d) => {
      const c = dayCompletion(active, byHabit!, d, modeOf);
      return {
        day: d === today ? "Oggi" : WEEKDAY_SHORT[weekday(d)],
        habits: c.rate == null ? 0 : Math.round(c.rate * 100),
        focus: Math.round(sessions!.filter((s) => s.date === d).reduce((a, s) => a + s.actualSec, 0) / 60),
      };
    });
    const avg = data.filter((_, i) => i < data.length - 1);
    const habitAvg = avg.length ? Math.round(avg.reduce((a, x) => a + x.habits, 0) / avg.length) : 0;
    const focusTotal = data.reduce((a, x) => a + x.focus, 0);
    return (
      <Card className={className}>
        <CardHeader title="Costanza settimanale" icon={<TrendingUp />} sub="Ultimi 7 giorni · solo dati registrati" />
        <div className="grid gap-6 px-4 pb-4 sm:grid-cols-2">
          <div>
            <Stat label="Completamento abitudini" value={`${habitAvg}%`} sub="Media degli ultimi 6 giorni" />
            <div className="mt-3">
              <MiniBarChart data={data} xKey="day" series={[{ key: "habits", name: "Completamento abitudini", color: "#ededef" }]} format={(v, k) => (k === "axis" ? `${v}` : `${v}%`)} yMax={100} height={120} />
            </div>
          </div>
          <div>
            <Stat label="Tempo di focus" value={formatDuration(focusTotal)} sub="Reale, non pianificato" />
            <div className="mt-3">
              <MiniBarChart data={data} xKey="day" series={[{ key: "focus", name: "Concentrato", color: "#d4d4d4" }]} format={(v) => formatDuration(v)} height={120} />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  function RecoveryCard() {
    const { setSleepDialog } = useApp();
    const last = sleeps!.find((s) => s.date === today);
    const target = sleepMinutes(settings.bedTime, settings.wakeTime);
    const logged = sleeps!.map((s) => sleepMinutes(s.bedTime, s.wakeTime));
    const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null;
    const lastMin = last ? sleepMinutes(last.bedTime, last.wakeTime) : null;
    return (
      <Card>
        <CardHeader
          title="Recupero e sonno"
          icon={<BedDouble />}
          action={
            <Button size="sm" variant="ghost" onClick={() => setSleepDialog(true)}>
              {last ? "Modifica" : "Registra"}
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-4 px-4 pb-4">
          <Stat label="Stanotte" value={lastMin != null ? formatDuration(lastMin) : "—"} sub={last ? `${last.bedTime} → ${last.wakeTime}` : "Non ancora registrato"} />
          <Stat label="Media 7 giorni" value={avg != null ? formatDuration(avg) : "—"} sub={`${logged.length} nott${logged.length === 1 ? "e" : "i"} registrat${logged.length === 1 ? "a" : "e"}`} />
          <div className="col-span-2">
            <div className="mb-1 flex justify-between text-[11px] text-subtle">
              <span>rispetto al piano ({formatDuration(target)})</span>
              <span className="tabular">{lastMin != null ? pct(Math.min(lastMin / target, 1.5)) : "—"}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((lastMin ?? 0) / target) * 100)}%`, background: lastMin != null && lastMin < 480 ? "var(--color-warn)" : "var(--color-ok)" }} />
            </div>
            <p className="mt-2 text-[11px] text-faint">A letto stasera alle {settings.bedTime}. Il sonno è allenamento, non tempo perso.</p>
          </div>
        </div>
      </Card>
    );
  }

  function UpcomingCard({ className }: { className?: string }) {
    const horizon = addDays(today, 3);
    const due = tasks!
      .filter((t) => t.status !== "done" && t.dueDate && t.dueDate >= today && t.dueDate <= horizon && t.missionDate !== today)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
    const laterBlocks = [1, 2].flatMap((n) => occurrencesOn(events!, addDays(today, n)).slice(0, 3));
    return (
      <Card className={className}>
        <CardHeader title="In arrivo" icon={<Clock />} sub="Prossimi 3 giorni" />
        <div className="grid gap-4 px-1.5 pb-2 sm:grid-cols-2">
          <div>
            <div className="px-3 pb-1 text-[11px] text-faint">In scadenza</div>
            {due.length === 0 ? <p className="px-3 pb-3 text-xs text-subtle">Niente in scadenza a breve.</p> : due.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} compact />)}
          </div>
          <div>
            <div className="px-3 pb-1 text-[11px] text-faint">Impegni</div>
            {laterBlocks.length === 0 ? <p className="px-3 pb-3 text-xs text-subtle">Nessun blocco nei prossimi due giorni.</p> : null}
            <ul className="px-3">
              {laterBlocks.map((o) => (
                <li key={o.key} className="flex items-center gap-2 py-1.5 text-[13px]">
                  <span className="w-16 text-[11px] text-subtle">{relativeDay(o.date, today)}</span>
                  <span className="font-mono text-[11px] text-faint">{o.event.start}</span>
                  <span className="size-1.5 rounded-full" style={{ background: categoryMeta(o.event.category).color }} />
                  <span className="truncate text-muted">{o.event.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    );
  }

  function ScoreMini() {
    const ws = startOfWeek(today, settings.weekStart);
    const s = weekScore({ from: ws, to: addDays(ws, 6), today, tz: settings.timeZone, habits, byHabit, modeOf, tasks, sessions: sessions.filter((x) => x.date >= ws), sleeps: sleeps.filter((x) => x.date >= ws) });
    return (
      <Card>
        <CardHeader
          title="Punteggio della settimana"
          icon={<Gauge />}
          action={
            <Link to="/review" className="text-[11px] text-subtle hover:text-fg">
              Revisione →
            </Link>
          }
        />
        <div className="px-4 pb-4">
          <div className="flex items-end gap-2">
            <span className="font-mono text-4xl font-light tabular">{s.score ?? "—"}</span>
            <span className="pb-1 text-xs text-subtle">{s.score == null ? "nessun dato" : "/ 100"}</span>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {s.components.map((c) => (
              <li key={c.id} className="grid grid-cols-[96px_1fr_36px] items-center gap-2 text-[11px]">
                <span className="text-subtle">{c.label}</span>
                <ProgressBar value={c.value ?? 0} color="#d4d4d4" label={c.label} />
                <span className="text-right text-muted tabular">{c.value == null ? "—" : pct(c.value)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-faint">Le azioni della settimana, non un giudizio su di te.</p>
        </div>
      </Card>
    );
  }

  function GoalsCard({ className }: { className?: string }) {
    const { domain } = useApp();
    const list = (goals ?? [])
      .map((g) => ({ g, p: goalProgress(g, tasks, today) }))
      .sort((a, b) => (a.g.targetDate ?? "9").localeCompare(b.g.targetDate ?? "9"))
      .slice(0, 4);
    return (
      <Card className={className}>
        <CardHeader
          title="Progresso obiettivi"
          icon={<Flag />}
          action={
            <Link to="/goals" className="text-[11px] text-subtle hover:text-fg">
              Tutti →
            </Link>
          }
        />
        <ul className="flex flex-col gap-3 px-4 pb-4">
          {list.length === 0 ? <li className="text-xs text-subtle">Nessun obiettivo attivo. Trasforma un'ambizione in un risultato misurabile.</li> : null}
          {list.map(({ g, p }) => (
            <li key={g.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate text-fg">{g.title}</span>
                <span className="shrink-0 text-[11px] text-subtle tabular">{p.progress == null ? "nessuna evidenza" : pct(p.progress)}</span>
              </div>
              <ProgressBar value={p.progress ?? 0} color={domain(g.domain)?.color} label={g.title} />
              {p.pace === "behind" ? <p className="mt-1 text-[11px] text-warn">In ritardo rispetto al tempo trascorso</p> : null}
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  function RecentCard() {
    const items = [
      ...tasks!.filter((t) => t.status === "done" && t.completedAt).map((t) => ({ at: t.completedAt!, text: t.title, kind: "Attività" })),
      ...sessions!.map((s) => ({ at: s.endedAt, text: `${formatDuration(s.actualSec / 60)} · ${s.label}`, kind: "Focus" })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 6);
    return (
      <Card>
        <CardHeader title="Completati di recente" icon={<CheckCircle2 />} />
        <ul className="px-4 pb-4">
          {items.length === 0 ? <li className="py-3 text-xs text-subtle">Qui compaiono attività completate e sessioni di focus.</li> : null}
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 py-1.5 text-[13px]">
              <Badge tone={it.kind === "Focus" ? "accent" : "ok"}>{it.kind}</Badge>
              <span className="min-w-0 flex-1 truncate text-muted">{it.text}</span>
              <span className="text-[11px] text-faint tabular">{dateOfMs(it.at, settings.timeZone) === today ? "" : relativeDay(dateOfMs(it.at, settings.timeZone), today) + " "}{timeOfMs(it.at, settings.timeZone)}</span>
            </li>
          ))}
        </ul>
      </Card>
    );
  }
}

function lowerRel(s: string) {
  return ["Oggi", "Domani", "Ieri"].includes(s) ? s.toLowerCase() : s;
}
