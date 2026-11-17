import { useMemo } from "react";
import { BedDouble, Gauge, Layers, Repeat2, Timer, CheckCircle2 } from "lucide-react";
import { useApp } from "@/hooks/app";
import { Card, CardHeader, PageHeader, ProgressBar, Skeleton, Stat } from "@/components/ui/misc";
import { MiniBarChart } from "@/components/charts";
import { weekFacts, weekScore } from "@/lib/analytics";
import { overallConsistency } from "@/lib/habits";
import { addDays, dateOfMs, formatDayMonth, formatDuration, hmToMin, sleepMinutes, startOfWeek } from "@/lib/date";
import { useAnalyticsData } from "./data";
import { ScoreCard } from "./ScoreCard";

const WEEKS = 8;

export function AnalyticsPage() {
  const { today, settings, tz, domains } = useApp();
  const cur = startOfWeek(today, settings.weekStart);
  const first = addDays(cur, -(WEEKS - 1) * 7);
  const data = useAnalyticsData(first, addDays(cur, 6));

  const view = useMemo(() => {
    if (!data) return null;
    const weeks = Array.from({ length: WEEKS }, (_, k) => addDays(first, k * 7));
    const rows = weeks.map((ws) => {
      const we = addDays(ws, 6);
      const input = data.input(ws, we);
      const s = weekScore(input);
      const f = weekFacts({ ...input, goals: data.goals });
      const end = we > today ? today : we;
      const c = overallConsistency(data.habits, data.byHabit, ws, end, today, data.modeOf);
      return {
        week: formatDayMonth(ws),
        score: s.score ?? 0,
        hasScore: s.score != null,
        focus: Math.round((f.focusMin / 60) * 10) / 10,
        habits: c.rate == null ? 0 : Math.round(c.rate * 100),
        tasks: f.tasksDone.length,
        sleep: f.sleepAvg == null ? 0 : Math.round((f.sleepAvg / 60) * 10) / 10,
      };
    });
    const current = weekScore(data.input(cur, addDays(cur, 6)));

    // Domain balance: last 4 weeks of focus time and completed tasks.
    const from4 = addDays(today, -27);
    const focusBy = new Map<string, number>();
    for (const s of data.sessions) if (s.date >= from4 && s.domain) focusBy.set(s.domain, (focusBy.get(s.domain) ?? 0) + s.actualSec / 60);
    const tasksBy = new Map<string, number>();
    for (const t of data.tasks) if (t.status === "done" && t.completedAt && dateOfMs(t.completedAt, tz) >= from4) tasksBy.set(t.domain, (tasksBy.get(t.domain) ?? 0) + 1);
    const maxFocus = Math.max(1, ...focusBy.values());

    // Sleep regularity: spread of bedtimes over the last 14 logged nights.
    const nights = [...data.sleeps].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
    const bedMins = nights.map((n) => {
      const m = hmToMin(n.bedTime);
      return m < 12 * 60 ? m + 1440 : m; // after-midnight bedtimes count as late, not early
    });
    const mean = bedMins.length ? bedMins.reduce((a, b) => a + b, 0) / bedMins.length : 0;
    const spread = bedMins.length >= 3 ? Math.sqrt(bedMins.reduce((a, b) => a + (b - mean) ** 2, 0) / bedMins.length) : null;
    const avgSleep = nights.length ? nights.reduce((a, n) => a + sleepMinutes(n.bedTime, n.wakeTime), 0) / nights.length : null;

    return { rows, current, focusBy, tasksBy, maxFocus, spread, avgSleep, nights: nights.length };
  }, [data, first, cur, today, tz]);

  return (
    <div>
      <PageHeader title="Analisi" description="Andamento delle ultime 8 settimane, calcolato solo da ciò che hai registrato. Osserva le tendenze, non il singolo giorno." />
      {!view ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <ScoreCard s={view.current} title="Punteggio · settimana in corso" compact />
          <Chart title="Punteggio di disciplina" icon={<Gauge />} data={view.rows} k="score" color="#d4d4d4" fmt={(v) => String(v)} yMax={100} note="Le settimane senza dati compaiono a zero ma non hanno punteggio." />
          <Chart title="Costanza abitudini" icon={<Repeat2 />} data={view.rows} k="habits" color="#ededef" fmt={(v, a) => (a ? String(v) : `${v}%`)} yMax={100} />
          <Chart title="Ore di lavoro concentrato" icon={<Timer />} data={view.rows} k="focus" color="#d4d4d4" fmt={(v) => `${v}h`} note="Solo tempo effettivo, mai quello pianificato." />
          <Chart title="Attività completate" icon={<CheckCircle2 />} data={view.rows} k="tasks" color="#4ade80" fmt={(v) => String(v)} />
          <Chart title="Sonno medio per notte" icon={<BedDouble />} data={view.rows} k="sleep" color="#a78bfa" fmt={(v) => `${v}h`} note="Le settimane senza notti registrate compaiono a zero." />

          <Card>
            <CardHeader title="Equilibrio tra le aree · 4 settimane" icon={<Layers />} />
            <div className="px-4 pb-4">
              <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-x-4 text-[10px] tracking-wider text-faint uppercase">
                <span>Area · focus</span>
                <span>Focus</span>
                <span>Attività</span>
              </div>
              <ul className="flex flex-col gap-2.5">
                {domains.map((d) => {
                  const f = view.focusBy.get(d.id) ?? 0;
                  return (
                    <li key={d.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 text-[12px]">
                      <div>
                        <div className="mb-1 text-muted">{d.label}</div>
                        <ProgressBar value={f / view.maxFocus} color={d.color} label={d.label} />
                      </div>
                      <span className="w-14 text-right text-fg tabular">{formatDuration(f)}</span>
                      <span className="w-8 text-right text-fg tabular">{view.tasksBy.get(d.id) ?? 0}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] text-faint">Confronta ogni area con se stessa nel tempo: ore di calcio e ore di studio non sono intercambiabili.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Regolarità del sonno · ultime 14 notti" icon={<BedDouble />} />
            <div className="grid grid-cols-3 gap-4 px-4 pb-4">
              <Stat label="Notti registrate" value={view.nights} />
              <Stat label="Durata media" value={view.avgSleep == null ? "—" : formatDuration(view.avgSleep)} />
              <Stat
                label="Variabilità orario"
                value={view.spread == null ? "—" : `±${Math.round(view.spread)} min`}
                sub={view.spread == null ? "servono almeno 3 notti" : view.spread <= 30 ? "regolare" : view.spread <= 60 ? "abbastanza regolare" : "irregolare"}
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Chart({ title, icon, data, k, color, fmt, yMax, note }: { title: string; icon: React.ReactNode; data: Record<string, unknown>[]; k: string; color: string; fmt: (v: number, axis?: boolean) => string; yMax?: number; note?: string }) {
  return (
    <Card>
      <CardHeader title={title} icon={icon} sub="8 settimane" />
      <div className="px-4 pb-4">
        <MiniBarChart data={data} xKey="week" series={[{ key: k, name: title, color }]} format={(v, key) => fmt(v, key === "axis")} yMax={yMax} height={130} />
        {note ? <p className="mt-1 text-[11px] text-faint">{note}</p> : null}
      </div>
    </Card>
  );
}
