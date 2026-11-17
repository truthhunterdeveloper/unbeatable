import { useEffect, useMemo, useState } from "react";
import { BedDouble, Moon, Sparkles } from "lucide-react";
import { useApp } from "@/hooks/app";
import { QuoteCard } from "@/components/QuoteCard";
import { useSleepLogs } from "@/hooks/data";
import { RecordSection, useRecords } from "@/components/records";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/misc";
import { MiniBarChart } from "@/components/charts";
import { useToast } from "@/components/ui/toast";
import { saveRecord } from "@/db/repo";
import { addDays, dateRange, formatDuration, sleepMinutes, weekday } from "@/lib/date";
import { errorMessage } from "@/lib/utils";

const WD = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export function PersonalPage() {
  const { today, setSleepDialog } = useApp();
  const records = useRecords(["energy", "reading", "learning"]);
  const sleeps = useSleepLogs(addDays(today, -13), today);

  const data = useMemo(() => {
    const days = dateRange(addDays(today, -13), today);
    const rs = records ?? [];
    const sleepRows = days.map((d) => {
      const s = sleeps?.find((x) => x.date === d);
      return { day: d === today ? "Oggi" : WD[weekday(d)], ore: s ? Math.round((sleepMinutes(s.bedTime, s.wakeTime) / 60) * 10) / 10 : 0 };
    });
    const energyRows = days.map((d) => {
      const e = rs.filter((r) => r.type === "energy" && r.date === d);
      return { day: d === today ? "Oggi" : WD[weekday(d)], energia: e.length ? Math.round((e.reduce((a, r) => a + Number(r.data.energy), 0) / e.length) * 10) / 10 : 0 };
    });
    const from30 = addDays(today, -29);
    const r30 = rs.filter((r) => r.date >= from30);
    const logged = (sleeps ?? []).map((s) => sleepMinutes(s.bedTime, s.wakeTime));
    return {
      sleepRows,
      energyRows,
      sleepAvg: logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null,
      pages: r30.filter((r) => r.type === "reading").reduce((a, r) => a + Number(r.data.pages ?? 0), 0),
      learnMin: r30.filter((r) => r.type === "learning").reduce((a, r) => a + Number(r.data.minutes ?? 0), 0),
    };
  }, [records, sleeps, today]);

  return (
    <div>
      <PageHeader title="Crescita personale" description="Sonno, energia, lettura, apprendimento e una breve riflessione serale. Pochi dati, utili: niente auto-monitoraggio eccessivo." />
      <QuoteCard areas={["personal"]} className="mb-5" />
      <div className="grid gap-5 lg:grid-cols-2">
        <EveningReflection />
        <Card>
          <CardHeader
            title="Sonno · 14 giorni"
            icon={<BedDouble />}
            action={
              <Button size="sm" variant="ghost" onClick={() => setSleepDialog(true)}>
                Registra
              </Button>
            }
          />
          <div className="grid grid-cols-3 gap-4 px-4">
            <Stat label="Media" value={data.sleepAvg == null ? "—" : formatDuration(data.sleepAvg)} sub="notti registrate" />
            <Stat label="Pagine lette (30 gg)" value={data.pages} />
            <Stat label="Pratica abilità (30 gg)" value={formatDuration(data.learnMin)} />
          </div>
          <div className="px-4 pt-3 pb-4">
            <MiniBarChart data={data.sleepRows} xKey="day" series={[{ key: "ore", name: "Ore di sonno", color: "#a78bfa" }]} format={(v) => `${v}h`} height={110} />
            <p className="mt-1 text-[11px] text-faint">Per gli adolescenti sono raccomandate 8–10 ore. Le barre a zero sono notti non registrate.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Energia · 14 giorni" icon={<Sparkles />} sub="1–5" />
          <div className="px-4 pb-4">
            <MiniBarChart data={data.energyRows} xKey="day" series={[{ key: "energia", name: "Energia media", color: "#f472b6" }]} format={(v) => String(v)} yMax={5} height={110} />
          </div>
        </Card>
        <RecordSection title="Energia e umore" types={["energy"]} empty="Un check-in veloce quando vuoi. L'umore è facoltativo." limit={6} />
        <RecordSection title="Lettura" types={["reading"]} empty="Libri, non feed." limit={8} />
        <RecordSection title="Abilità e apprendimento" types={["learning"]} empty="Cosa stai imparando?" limit={8} />
        <RecordSection title="Riflessioni passate" types={["reflection"]} empty="Le riflessioni serali appariranno qui." limit={7} className="lg:col-span-2" />
      </div>
    </div>
  );
}

const QUESTIONS = [
  { key: "completed", label: "Cosa ho completato?" },
  { key: "distracted", label: "Cosa mi ha distratto?" },
  { key: "learned", label: "Cosa ho imparato?" },
  { key: "improve", label: "Cosa migliorerò domani?" },
] as const;

/** The four-question evening reflection. Short and practical by design. */
export function EveningReflection({ compact }: { compact?: boolean }) {
  const { today } = useApp();
  const toast = useToast();
  const all = useRecords(["reflection"]);
  const existing = all?.find((r) => r.date === today);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setForm(Object.fromEntries(QUESTIONS.map((q) => [q.key, String(existing?.data[q.key] ?? "")])));
  }, [existing]);

  async function save() {
    if (!form.completed?.trim()) return toast.error("Scrivi almeno cosa hai completato.");
    try {
      await saveRecord({ id: existing?.id ?? `reflection:${today}`, type: "reflection", date: today, data: form });
      toast.success("Riflessione salvata");
      setEditing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const showForm = !existing || editing;
  return (
    <Card>
      <CardHeader
        title="Riflessione serale"
        icon={<Moon />}
        sub="2 minuti"
        action={existing && !editing ? <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Modifica</Button> : null}
      />
      <div className="px-4 pb-4">
        {showForm ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {QUESTIONS.slice(0, compact ? 4 : 4).map((q) => (
              <label key={q.key} className="flex flex-col gap-1">
                <span className="text-xs text-muted">{q.label}</span>
                <Textarea rows={compact ? 1 : 2} className="min-h-0" value={form[q.key] ?? ""} maxLength={600} onChange={(e) => setForm((f) => ({ ...f, [q.key]: e.target.value }))} />
              </label>
            ))}
            <Button type="submit" variant="primary" size="sm" className="self-start">
              Salva riflessione
            </Button>
          </form>
        ) : (
          <dl className="flex flex-col gap-2 text-[13px]">
            {QUESTIONS.map((q) =>
              existing!.data[q.key] ? (
                <div key={q.key}>
                  <dt className="text-[11px] text-subtle">{q.label}</dt>
                  <dd className="text-fg">{String(existing!.data[q.key])}</dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
      </div>
    </Card>
  );
}
