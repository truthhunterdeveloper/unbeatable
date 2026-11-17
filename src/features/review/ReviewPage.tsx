import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Eye, Lightbulb, NotebookPen } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRecords } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Card, CardHeader, PageHeader, Skeleton, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { saveRecord } from "@/db/repo";
import { habitStats } from "@/lib/habits";
import { suggestions, weekFacts, weekScore } from "@/lib/analytics";
import { addDays, formatDuration, formatShort, relativeDay, startOfWeek, WEEKDAY_SHORT } from "@/lib/date";
import { errorMessage, pct } from "@/lib/utils";
import { ScoreCard } from "./ScoreCard";
import { useAnalyticsData } from "./data";

const QUESTIONS = [
  { key: "worked", label: "Cosa ha funzionato?" },
  { key: "failed", label: "Cosa non ha funzionato?" },
  { key: "why", label: "Perché?" },
  { key: "next", label: "Cosa cambio la prossima settimana?" },
] as const;

export function ReviewPage() {
  const { today, settings, domain } = useApp();
  const thisWeek = startOfWeek(today, settings.weekStart);
  const [from, setFrom] = useState(thisWeek);
  const to = addDays(from, 6);
  const data = useAnalyticsData(from, to);
  const exams = useRecords(["exam"]);
  const tasksAll = data?.tasks;

  const view = useMemo(() => {
    if (!data) return null;
    const input = data.input(from, to);
    const score = weekScore(input);
    const facts = weekFacts({ ...input, goals: data.goals });
    const horizon = addDays(today, 7);
    const upcomingExams = (exams ?? []).filter((e) => e.date >= today && e.date <= horizon);
    const plannedExamIds = new Set((tasksAll ?? []).filter((t) => t.notes.startsWith("piano-esame:")).map((t) => t.notes.slice(12)));
    const activeHabits = data.habits.filter((h) => !h.archived && h.tier !== "optional");
    const sug = suggestions(score, facts, { upcomingExams, plannedExamIds, activeHabitCount: activeHabits.length });
    const end = to > today ? today : to;
    const perHabit = activeHabits.map((h) => ({ h, s: habitStats(h, data.byHabit.get(h.id) ?? new Map(), from, end, today, data.modeOf) }));
    const dueSoon = (tasksAll ?? []).filter((t) => t.status !== "done" && t.dueDate && t.dueDate > today && t.dueDate <= horizon).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    return { score, facts, sug, perHabit, upcomingExams, dueSoon };
  }, [data, exams, tasksAll, from, to, today]);

  const isCurrent = from === thisWeek;

  return (
    <div>
      <PageHeader
        title="Revisione settimanale"
        description="Prima i fatti registrati, poi i suggerimenti, poi la tua riflessione. Dieci minuti a settimana per correggere la rotta."
      />
      <div className="mb-5 flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Settimana precedente" onClick={() => setFrom(addDays(from, -7))}>
          <ChevronLeft />
        </Button>
        <span className="text-[15px] font-medium">
          {formatShort(from)} – {formatShort(to)}
        </span>
        <Button variant="ghost" size="icon" aria-label="Settimana successiva" disabled={isCurrent} onClick={() => setFrom(addDays(from, 7))}>
          <ChevronRight />
        </Button>
        {!isCurrent ? (
          <Button size="sm" variant="secondary" onClick={() => setFrom(thisWeek)}>
            Questa settimana
          </Button>
        ) : (
          <span className="text-xs text-subtle">settimana in corso</span>
        )}
      </div>

      {!view ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-5">
            <ScoreCard s={view.score} />
            <Card>
              <CardHeader title="Suggerimenti" icon={<Lightbulb />} sub="regole trasparenti, non verità" />
              <ul className="flex flex-col gap-3 px-4 pb-4">
                {view.sug.length === 0 ? <li className="text-xs text-subtle">Servono più dati per suggerire qualcosa.</li> : null}
                {view.sug.map((s, i) => (
                  <li key={i}>
                    <p className="text-[13px] text-fg">{s.text}</p>
                    <p className="mt-0.5 text-[11px] text-subtle">Perché: {s.because}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title="Osservazioni" icon={<Eye />} sub="solo dati registrati" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-4 pb-4 sm:grid-cols-3">
                <Stat label="Lavoro concentrato" value={formatDuration(view.facts.focusMin)} sub={`${view.facts.sessions} sessioni · ${view.facts.sessionsToPlan} fino in fondo`} />
                <Stat label="Tempo interrotto" value={formatDuration(view.facts.pausedMin)} sub={`${view.facts.distractions.reduce((a, d) => a + d[1], 0)} distrazioni annotate`} />
                <Stat label="Momento migliore" value={view.facts.bestPeriod ?? "—"} sub="più minuti di focus" />
                <Stat label="Attività completate" value={view.facts.tasksDone.length} sub={`${view.facts.importantDone} importanti`} />
                <Stat label="Obiettivi" value={`${view.facts.goalsAchieved.length} raggiunti`} sub={`${view.facts.goalsMissed.length} mancati · ${view.facts.milestonesDone.length} traguardi · ${view.facts.measurements} misure`} />
                <Stat label="Sonno medio" value={view.facts.sleepAvg == null ? "—" : formatDuration(view.facts.sleepAvg)} sub={`${view.facts.shortNights} notti sotto 8 h · ${view.facts.recoveryDays} gg di Recupero`} />
              </div>
              <div className="grid gap-4 border-t border-line px-4 py-4 sm:grid-cols-2">
                <div>
                  <div className="eyebrow mb-2">Abitudini</div>
                  {view.perHabit.length === 0 ? <p className="text-xs text-subtle">Nessuna abitudine prevista.</p> : null}
                  <ul className="flex flex-col gap-1">
                    {view.perHabit.map(({ h, s }) => (
                      <li key={h.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="flex min-w-0 items-center gap-2 truncate text-muted">
                          <span className="size-1.5 shrink-0 rounded-full" style={{ background: domain(h.domain)?.color }} />
                          {h.name}
                        </span>
                        <span className="shrink-0 text-fg tabular">{pct(s.rate)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="eyebrow mb-2">Distrazioni principali</div>
                  {view.facts.distractions.length === 0 ? <p className="text-xs text-subtle">Nessuna distrazione annotata.</p> : null}
                  <ul className="flex flex-col gap-1">
                    {view.facts.distractions.slice(0, 5).map(([k, n]) => (
                      <li key={k} className="flex justify-between text-[12px]">
                        <span className="text-muted">{k}</span>
                        <span className="text-fg tabular">{n}×</span>
                      </li>
                    ))}
                  </ul>
                  <div className="eyebrow mt-4 mb-2">Focus per giorno</div>
                  <div className="flex items-end gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                      const m = view.facts.byWeekday[d];
                      const max = Math.max(1, ...view.facts.byWeekday);
                      return (
                        <div key={d} className="flex flex-1 flex-col items-center gap-1" title={`${WEEKDAY_SHORT[d]}: ${formatDuration(m)}`}>
                          <div className="w-full rounded-sm bg-accent/80" style={{ height: Math.max(2, (m / max) * 48) }} />
                          <span className="text-[10px] text-faint">{WEEKDAY_SHORT[d][0]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Prossimi 7 giorni" icon={<CalendarClock />} />
              <ul className="flex flex-col gap-1.5 px-4 pb-4 text-[13px]">
                {view.upcomingExams.length === 0 && view.dueSoon.length === 0 ? <li className="text-xs text-subtle">Niente in scadenza.</li> : null}
                {view.upcomingExams.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-16 text-[11px] text-warn">{relativeDay(e.date, today)}</span>
                    Esame: {String(e.data.title)}
                  </li>
                ))}
                {view.dueSoon.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex gap-3">
                    <span className="w-16 text-[11px] text-subtle">{relativeDay(t.dueDate!, today)}</span>
                    <span className="truncate text-muted">{t.title}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <WeeklyReflection weekStart={from} />
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyReflection({ weekStart }: { weekStart: string }) {
  const toast = useToast();
  const all = useRecords(["weeklyReview"]);
  const existing = all?.find((r) => r.date === weekStart);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm(Object.fromEntries(QUESTIONS.map((q) => [q.key, String(existing?.data[q.key] ?? "")])));
  }, [existing, weekStart]);

  async function save() {
    if (!form.worked?.trim()) return toast.error("Scrivi almeno cosa ha funzionato.");
    try {
      await saveRecord({ id: `weeklyReview:${weekStart}`, type: "weeklyReview", date: weekStart, data: form });
      toast.success("Revisione salvata");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader title="La tua riflessione" icon={<NotebookPen />} sub={existing ? "salvata" : undefined} />
      <form
        className="flex flex-col gap-3 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {QUESTIONS.map((q) => (
          <label key={q.key} className="flex flex-col gap-1">
            <span className="text-xs font-medium tracking-wide text-muted uppercase">{q.label}</span>
            <Textarea rows={2} value={form[q.key] ?? ""} maxLength={1500} onChange={(e) => setForm((f) => ({ ...f, [q.key]: e.target.value }))} />
          </label>
        ))}
        <Button type="submit" variant="primary" size="sm" className="self-start">
          Salva revisione
        </Button>
      </form>
    </Card>
  );
}
