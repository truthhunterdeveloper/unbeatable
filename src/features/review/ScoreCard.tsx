import { useState } from "react";
import { Gauge, Info } from "lucide-react";
import { Card, CardHeader, ProgressBar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import type { WeekScore } from "@/lib/analytics";
import { pct } from "@/lib/utils";

/** The Discipline Score with its full, inspectable breakdown. */
export function ScoreCard({ s, title = "Punteggio di disciplina", sub, compact }: { s: WeekScore; title?: string; sub?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader
        title={title}
        icon={<Gauge />}
        sub={sub}
        action={
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Info /> {open ? "Nascondi calcolo" : "Come si calcola"}
          </Button>
        }
      />
      <div className="px-4 pb-4">
        <div className="flex items-end gap-3">
          <span className="font-mono text-5xl font-light tracking-tight tabular">{s.score ?? "—"}</span>
          <span className="pb-1.5 text-xs text-subtle">{s.score == null ? "nessun dato registrato" : "/ 100"}</span>
        </div>
        <p className="mt-1 text-[11px] text-faint">Descrive le azioni della settimana, non il tuo valore. Riposo, malattia e recupero pianificato non abbassano il punteggio.</p>
        <ul className={compact ? "mt-3 flex flex-col gap-2" : "mt-4 flex flex-col gap-3"}>
          {s.components.map((c) => (
            <li key={c.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                <span className="text-fg">
                  {c.label} <span className="text-faint">· peso {c.weight}</span>
                </span>
                <span className="text-muted tabular">{c.value == null ? "escluso" : pct(c.value)}</span>
              </div>
              <ProgressBar value={c.value ?? 0} color={c.value == null ? "transparent" : "#d4d4d4"} label={c.label} />
              {!compact ? <p className="mt-1 text-[11px] text-subtle">{c.detail}</p> : null}
              {open ? <p className="mt-1 text-[11px] text-faint">Formula: {c.formula}</p> : null}
            </li>
          ))}
        </ul>
        {open ? (
          <div className="mt-4 rounded-lg border border-line bg-white/[0.015] p-3 text-[11px] leading-relaxed text-subtle">
            Punteggio = 100 × Σ(peso × valore) ÷ Σ(pesi delle componenti con dati). Le componenti senza dati vengono escluse, non contate come zero. Questa settimana è coperto il{" "}
            {s.coveredWeight}% del peso totale.
          </div>
        ) : null}
      </div>
    </Card>
  );
}
