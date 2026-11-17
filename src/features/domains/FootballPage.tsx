import { useMemo } from "react";
import { Activity, AlertTriangle, BedDouble, Flag, Target } from "lucide-react";
import { useApp } from "@/hooks/app";
import { QuoteCard } from "@/components/QuoteCard";
import { useSleepLogs } from "@/hooks/data";
import { RecordSection, useRecords } from "@/components/records";
import { Card, CardHeader, PageHeader, ProgressBar, Stat } from "@/components/ui/misc";
import { MiniBarChart } from "@/components/charts";
import { FOOTBALL_SKILLS } from "@/db/records";
import { footballLoad, skillFocusCounts } from "@/lib/domains";
import { addDays, formatDayMonth, formatDuration, sleepMinutes } from "@/lib/date";

export function FootballPage() {
  const { today } = useApp();
  const records = useRecords(["training", "match", "refMatch"]);
  const sleeps = useSleepLogs(addDays(today, -6), today);

  const data = useMemo(() => {
    const rs = records ?? [];
    const load = footballLoad(rs, today);
    const skills = skillFocusCounts(rs, addDays(today, -29));
    const refs = rs.filter((r) => r.type === "refMatch").sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
    const avg = (k: string) => {
      const xs = refs.map((r) => Number(r.data[k])).filter((n) => n > 0);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const last30 = rs.filter((r) => r.date >= addDays(today, -29));
    return {
      load,
      skills,
      ref: { count: refs.length, positioning: avg("positioning"), communication: avg("communication"), management: avg("management") },
      sessions30: last30.filter((r) => r.type === "training").length,
      minutes30: last30.filter((r) => r.type === "training").reduce((a, r) => a + Number(r.data.duration ?? 0), 0),
      matches30: last30.filter((r) => r.type === "match").length,
    };
  }, [records, today]);

  const sleepAvg = sleeps && sleeps.length ? sleeps.reduce((a, s) => a + sleepMinutes(s.bedTime, s.wakeTime), 0) / sleeps.length : null;
  const maxSkill = Math.max(1, ...data.skills.values());

  return (
    <div>
      <PageHeader title="Calcio" description="Allenamento, partite e arbitraggio. Il recupero fa parte della prestazione: l'app non prescrive carichi, mostra solo ciò che hai fatto." />
      <QuoteCard areas={["football"]} className="mb-5" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Carico di allenamento" icon={<Activity />} sub="RPE × minuti" />
          <div className="grid grid-cols-3 gap-4 px-4">
            <Stat label="Ultimi 7 giorni" value={Math.round(data.load.acute)} sub="unità di carico" />
            <Stat label="Media settimanale (4 sett. prec.)" value={data.load.chronic == null ? "—" : Math.round(data.load.chronic)} sub={data.load.chronic == null ? "serve più storico" : "unità"} />
            <Stat label="Giorni di riposo (7 gg)" value={data.load.restDays} />
          </div>
          <div className="px-4 pt-3 pb-4">
            {data.load.flag === "spike" ? (
              <p className="mb-3 flex gap-2 text-xs text-warn">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Questa settimana il carico è {data.load.ratio!.toFixed(1)}× la tua media recente. Gli aumenti bruschi sono associati a più infortuni: valuta con il tuo allenatore se
                inserire più recupero.
              </p>
            ) : data.load.flag === "low" ? (
              <p className="mb-3 text-xs text-subtle">Carico più basso del solito: va benissimo se è una settimana di scarico, malattia o esami.</p>
            ) : data.load.flag === "steady" ? (
              <p className="mb-3 text-xs text-subtle">Carico in linea con le settimane precedenti.</p>
            ) : null}
            <MiniBarChart
              data={data.load.weeks.map((w) => ({ week: formatDayMonth(w.weekStart), load: Math.round(w.load) }))}
              xKey="week"
              series={[{ key: "load", name: "Carico", color: "#60a5fa" }]}
              format={(v) => String(v)}
              height={120}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Ultimi 30 giorni" icon={<Target />} />
          <div className="grid grid-cols-3 gap-4 px-4 pb-3">
            <Stat label="Allenamenti" value={data.sessions30} sub={formatDuration(data.minutes30)} />
            <Stat label="Partite" value={data.matches30} />
            <Stat label="Sonno medio (7 gg)" value={sleepAvg == null ? "—" : formatDuration(sleepAvg)} sub={<span className="inline-flex items-center gap-1"><BedDouble className="size-3" /> recupero</span>} />
          </div>
          <div className="px-4 pb-4">
            <div className="eyebrow mb-2">Focus tecnico (sessioni)</div>
            {data.skills.size === 0 ? (
              <p className="text-xs text-subtle">Indica il focus tecnico quando registri un allenamento.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {[...data.skills.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => (
                    <li key={k} className="grid grid-cols-[110px_1fr_24px] items-center gap-2 text-[11px]">
                      <span className="truncate text-muted">{FOOTBALL_SKILLS.find((s) => s.value === k)?.label ?? k}</span>
                      <ProgressBar value={n / maxSkill} color="#60a5fa" label={k} />
                      <span className="text-right text-subtle tabular">{n}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Arbitraggio · ultime 5 gare" icon={<Flag />} />
          <div className="grid grid-cols-3 gap-4 px-4 pb-4">
            {(["positioning", "communication", "management"] as const).map((k) => (
              <Stat key={k} label={{ positioning: "Posizionamento", communication: "Comunicazione", management: "Gestione gara" }[k]} value={data.ref[k] == null ? "—" : `${data.ref[k]!.toFixed(1)}/5`} />
            ))}
          </div>
          {data.ref.count === 0 ? <p className="px-4 pb-4 text-xs text-subtle">Registra le gare che arbitri con obiettivi e analisi post-gara.</p> : null}
        </Card>

        <RecordSection title="Allenamenti" types={["training"]} empty="Nessun allenamento registrato." limit={8} />
        <RecordSection title="Partite" types={["match"]} empty="Nessuna partita registrata." limit={8} />
        <RecordSection title="Gare arbitrate" types={["refMatch"]} empty="Nessuna gara arbitrata registrata." limit={8} />
      </div>
    </div>
  );
}
