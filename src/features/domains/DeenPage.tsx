import { useMemo } from "react";
import { Link } from "react-router";
import { BookOpen, Lock, Moon } from "lucide-react";
import { useApp } from "@/hooks/app";
import { AyahCard, QuoteCard } from "@/components/QuoteCard";
import { PrayerCard } from "./PrayerCard";
import { saveRecord } from "@/db/repo";
import { RecordSection, useRecords } from "@/components/records";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { addDays, dateRange, formatShort, relativeDay } from "@/lib/date";
import { cn, errorMessage } from "@/lib/utils";

export const PRAYERS = [
  { key: "fajr", label: "Fajr" },
  { key: "dhuhr", label: "Dhuhr" },
  { key: "asr", label: "Asr" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isha", label: "Isha" },
] as const;

export function DeenPage() {
  const { settings, today } = useApp();
  const tracking = settings.prayerTracking !== false;
  const records = useRecords(["quran", "hifz", "islamicStudy"]);
  const from30 = addDays(today, -29);

  const stats = useMemo(() => {
    const rs = records ?? [];
    const in30 = rs.filter((r) => r.date >= from30);
    const in7 = in30.filter((r) => r.date >= addDays(today, -6));
    const pages = (xs: typeof rs) => xs.filter((r) => r.type === "quran").reduce((a, r) => a + Number(r.data.pages ?? 0), 0);
    return {
      pages7: pages(in7),
      pages30: pages(in30),
      newHifz: in30.filter((r) => r.type === "hifz" && r.data.kind === "new").length,
      revision: in30.filter((r) => r.type === "hifz" && r.data.kind === "revision").length,
      studyMin: in30.filter((r) => r.type === "islamicStudy").reduce((a, r) => a + Number(r.data.minutes ?? 0), 0),
    };
  }, [records, today, from30]);

  return (
    <div>
      <PageHeader title="Deen" description="Uno spazio personale per costruire costanza nella pratica. Nessuna classifica, nessun punteggio: solo ciò che vuoi ricordare." />
      <PrayerCard className="mb-3" />
      <AyahCard className="mb-3" />
      <QuoteCard areas={["deen"]} className="mb-5" />
      <div className="mb-5 flex gap-3 rounded-xl border border-line bg-white/[0.015] p-3.5 text-xs leading-relaxed text-subtle">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <p>
          Tutto resta su questo dispositivo. L'app non misura il rapporto con Allah e non attribuisce valore spirituale: registra solo le azioni, per aiutarti a essere costante. Gli orari
          delle preghiere non vengono calcolati né inventati: per orari esatti serve una posizione e un metodo di calcolo verificato (moschea locale o app affidabile). Puoi aggiungerli come
          blocchi nel Planner.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {tracking ? <PrayerTracker /> : (
          <Card className="p-4 text-xs text-subtle">
            Il tracciamento delle preghiere è disattivato. Puoi riattivarlo in <Link to="/settings" className="text-fg underline">Impostazioni</Link>.
          </Card>
        )}
        <Card>
          <CardHeader title="Ultimi 30 giorni" icon={<BookOpen />} />
          <div className="grid grid-cols-2 gap-4 px-4 pb-4 sm:grid-cols-3">
            <Stat label="Pagine di Corano (7 gg)" value={stats.pages7} />
            <Stat label="Pagine di Corano (30 gg)" value={stats.pages30} />
            <Stat label="Studio islamico" value={`${stats.studyMin} min`} />
            <Stat label="Memorizzazione nuova" value={stats.newHifz} sub="sessioni" />
            <Stat label="Ripasso" value={stats.revision} sub="sessioni" />
          </div>
        </Card>
        <RecordSection title="Lettura del Corano" types={["quran"]} empty="Nessuna lettura registrata." limit={8} />
        <RecordSection title="Memorizzazione e ripasso" types={["hifz"]} empty="Registra cosa memorizzi e quando ripassi." limit={8} />
        <RecordSection title="Studio islamico" types={["islamicStudy"]} empty="Lezioni, libri, conferenze." limit={8} />
        <RecordSection title="Riflessioni personali" types={["deenReflection"]} empty="Pensieri privati, solo per te." limit={6} />
      </div>
    </div>
  );
}

function PrayerTracker() {
  const { today } = useApp();
  const toast = useToast();
  const prayers = useRecords(["prayer"]);
  const days = dateRange(addDays(today, -6), today).reverse();
  const byDate = new Map((prayers ?? []).map((r) => [r.date, r]));

  async function toggle(date: string, key: string) {
    const cur = byDate.get(date)?.data ?? {};
    const data = Object.fromEntries(PRAYERS.map((p) => [p.key, p.key === key ? !cur[p.key] : !!cur[p.key]]));
    try {
      await saveRecord({ id: `prayer:${date}`, type: "prayer", date, data });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader title="Preghiere · ultimi 7 giorni" icon={<Moon />} sub="privato e facoltativo" />
      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-subtle">
              <th className="py-1 text-left font-normal">Giorno</th>
              {PRAYERS.map((p) => (
                <th key={p.key} className="py-1 font-normal">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const rec = byDate.get(d);
              return (
                <tr key={d} className="border-t border-line">
                  <td className="py-1.5 text-muted">{d === today ? "Oggi" : relativeDay(d, today) === "Ieri" ? "Ieri" : formatShort(d)}</td>
                  {PRAYERS.map((p) => {
                    const on = !!rec?.data[p.key];
                    return (
                      <td key={p.key} className="py-1.5 text-center">
                        <button
                          aria-pressed={on}
                          aria-label={`${p.label} ${formatShort(d)}`}
                          onClick={() => toggle(d, p.key)}
                          className={cn("mx-auto grid size-6 place-items-center rounded-md border transition-colors", on ? "border-transparent bg-[#34d399] text-bg" : "border-line-strong hover:border-white/30")}
                        >
                          {on ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
