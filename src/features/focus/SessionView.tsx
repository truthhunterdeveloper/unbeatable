import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Check, Coffee, Minimize2, Pause, Play, Plus, Square, Zap } from "lucide-react";
import type { ActiveFocus } from "@/db/schema";
import { setTaskStatus } from "@/db/repo";
import { useApp } from "@/hooks/app";
import { QuoteCard } from "@/components/QuoteCard";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Kbd, Segmented } from "@/components/ui/misc";
import { useFocus } from "./FocusProvider";
import { MIN_SAVE_MS, focusedMs, pausedTotalMs, progress, remainingMs } from "@/lib/focus";
import { formatClock, formatDuration } from "@/lib/date";
import { cn, errorMessage, isTypingTarget } from "@/lib/utils";

const QUICK_DISTRACTIONS = ["Telefono", "Notifica", "Rumore", "Qualcuno che parla", "Fame", "Pensieri che vagano"];

export function SessionView({ active }: { active: ActiveFocus }) {
  const focus = useFocus();
  const { domain } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const { now } = focus;
  const [distractOpen, setDistractOpen] = useState(false);
  const [distractNote, setDistractNote] = useState("");
  const [markDone, setMarkDone] = useState(false);
  const d = domain(active.domain);

  const wrap = (p: Promise<unknown>) => p.catch((e) => toast.error(errorMessage(e)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || document.querySelector("[role=dialog]") || e.metaKey || e.ctrlKey) return;
      if (active.phase !== "focus") return;
      if (e.key === " ") {
        e.preventDefault();
        wrap(active.runningSince != null ? focus.pause() : focus.resume());
      } else if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        setDistractOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const logDistraction = (note: string) => {
    wrap(focus.distraction(note || "Non specificata"));
    setDistractNote("");
    setDistractOpen(false);
    toast.info("Distrazione annotata. Torna al lavoro.");
  };

  if (active.phase === "review") {
    return <Review active={active} markDone={markDone} setMarkDone={setMarkDone} />;
  }

  const isBreak = active.phase === "break";
  const paused = !isBreak && active.runningSince == null;
  const remaining = remainingMs(active, now);
  const p = progress(active, now);
  const status = isBreak ? "In pausa" : paused ? "In pausa" : "Concentrato";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-[11px] text-faint">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-5 opacity-70" />
          Lavoro profondo
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} title="Esci da questa vista — il timer continua">
          <Minimize2 /> Riduci
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="eyebrow">{isBreak ? "Recupero" : "Missione attuale"}</div>
        <h1 className="mt-3 max-w-2xl text-xl font-medium tracking-tight text-fg sm:text-2xl">
          {isBreak ? "Allontanati dallo schermo. Acqua, stretching, respira." : active.label}
        </h1>
        {!isBreak && d ? (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
            <span className="size-1.5 rounded-full" style={{ background: d.color }} />
            {d.label}
          </div>
        ) : null}

        <div className="relative mt-12 mb-10">
          <div className="eyebrow mb-3">Tempo rimanente</div>
          <div className={cn("font-mono text-[72px] leading-none font-light tracking-[-0.04em] tabular sm:text-[112px]", paused ? "text-subtle" : "text-fg")} aria-live="off" role="timer">
            {formatClock(remaining)}
          </div>
          <div className="mx-auto mt-8 h-px w-64 overflow-hidden bg-white/10 sm:w-80">
            <div className="h-full bg-fg transition-[width] duration-300 ease-linear" style={{ width: `${p * 100}%`, background: isBreak ? "var(--color-ok)" : undefined }} />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="eyebrow">Stato del focus</span>
          <span className={cn("flex items-center gap-1.5 font-medium", paused ? "text-warn" : isBreak ? "text-ok" : "text-fg")}>
            <span className={cn("size-1.5 rounded-full", paused ? "bg-warn" : isBreak ? "bg-ok" : "animate-breathe bg-accent")} />
            {status}
          </span>
          {!isBreak && active.distractions.length ? <span className="text-faint">· {active.distractions.length} distrazion{active.distractions.length > 1 ? "i annotate" : "e annotata"}</span> : null}
        </div>

        {!isBreak ? <QuoteCard areas={["comeback"]} variant="inline" className="mt-6 max-w-md text-center" /> : null}

        {distractOpen ? (
          <form
            className="mt-6 w-full max-w-md animate-rise rounded-xl border border-line-strong bg-surface p-3 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              logDistraction(distractNote);
            }}
          >
            <label htmlFor="distraction" className="text-xs text-muted">
              Cosa ha catturato la tua attenzione? Basta annotarlo.
            </label>
            <input
              id="distraction"
              autoFocus
              value={distractNote}
              maxLength={200}
              onChange={(e) => setDistractNote(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setDistractOpen(false)}
              className="mt-2 h-9 w-full rounded-lg border border-line-strong bg-white/[0.02] px-3 text-[13px] focus:border-accent/60 focus:outline-none"
              placeholder="es. ho controllato i messaggi"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_DISTRACTIONS.map((q) => (
                <button key={q} type="button" onClick={() => logDistraction(q)} className="rounded-md border border-line px-2 py-1 text-[11px] text-subtle hover:border-line-strong hover:text-fg">
                  {q}
                </button>
              ))}
            </div>
          </form>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-5 pt-4 pb-10">
        {isBreak ? (
          <Button size="lg" variant="secondary" onClick={() => wrap(focus.endBreak())}>
            Salta la pausa
          </Button>
        ) : (
          <>
            <Button size="lg" variant="secondary" onClick={() => wrap(paused ? focus.resume() : focus.pause())}>
              {paused ? <Play /> : <Pause />}
              {paused ? "Riprendi" : "Pausa"}
              <Kbd className="ml-1">Space</Kbd>
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setDistractOpen((o) => !o)}>
              <Zap /> Distrazione <Kbd className="ml-1">D</Kbd>
            </Button>
            <Button
              size="lg"
              variant="primary"
              onClick={() => {
                setMarkDone(!!active.taskId);
                wrap(focus.finish());
              }}
            >
              <Check /> Completa
            </Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                setMarkDone(false);
                wrap(focus.finish());
              }}
            >
              <Square /> Fine
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Review({ active, markDone, setMarkDone }: { active: ActiveFocus; markDone: boolean; setMarkDone: (v: boolean) => void }) {
  const focus = useFocus();
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const [quality, setQuality] = useState("none");
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const end = active.endedAt ?? Date.now();
  const actual = focusedMs(active, end);
  const paused = pausedTotalMs(active, end);
  const canSave = actual >= MIN_SAVE_MS;

  async function save(withBreak: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const taskId = active.taskId;
      await focus.save(notes, quality === "none" ? null : Number(quality));
      if (markDone && taskId) await setTaskStatus(taskId, "done");
      toast.success(`Salvati ${formatDuration(actual / 60000)} di lavoro concentrato`);
      if (withBreak) await focus.startBreak();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg animate-fade-in">
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-5 py-12">
        <div className="eyebrow">{active.reachedTarget ? "Sessione completata" : "Sessione terminata"}</div>
        <h1 className="mt-2 text-xl font-medium tracking-tight">{active.label}</h1>

        <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {[
            ["Concentrato", formatClock(actual)],
            ["Pianificato", formatClock(active.plannedMin * 60_000)],
            ["Interrotto", formatClock(paused)],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface p-3">
              <dt className="text-[11px] text-subtle">{k}</dt>
              <dd className="mt-0.5 font-mono text-base text-fg tabular">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] text-faint">Solo il tempo di concentrazione viene registrato come lavoro. Il tempo pianificato è un'intenzione, non un risultato.</p>

        {active.distractions.length ? (
          <div className="mt-5">
            <div className="eyebrow mb-1.5">Distrazioni annotate</div>
            <ul className="flex flex-wrap gap-1.5">
              {active.distractions.map((x, i) => (
                <li key={i} className="rounded-md border border-line px-2 py-1 text-[11px] text-muted">
                  {x.note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Quanto eri concentrato? (facoltativo)</span>
          <Segmented
            label="Qualità del focus"
            value={quality}
            onChange={setQuality}
            className="w-full"
            options={[
              { value: "none", label: "—" },
              { value: "1", label: "1", title: "Dispersivo" },
              { value: "2", label: "2" },
              { value: "3", label: "3", title: "Costante" },
              { value: "4", label: "4" },
              { value: "5", label: "5", title: "Totalmente concentrato" },
            ]}
          />
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Note della sessione</span>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Cosa hai fatto? Da dove riprenderai?" />
        </label>

        {active.taskId ? (
          <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
            <input type="checkbox" className="accent-[#d4d4d4]" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} />
            Segna l'attività come completata
          </label>
        ) : null}

        {!canSave ? <p className="mt-4 text-xs text-warn">Meno di un minuto di concentrazione: non c'è nulla di significativo da salvare.</p> : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" size="lg" disabled={!canSave || busy} onClick={() => save(true)}>
            <Coffee /> Save & take a {active.breakMin}-min break
          </Button>
          <Button variant="secondary" size="lg" disabled={!canSave || busy} onClick={() => save(false)}>
            Salva
          </Button>
          {active.reachedTarget ? (
            <Button variant="ghost" size="lg" onClick={() => focus.extend(10).catch((e) => toast.error(errorMessage(e)))}>
              <Plus /> Altri 10 minuti
            </Button>
          ) : null}
        </div>
        <button
          className="mt-6 self-start text-xs text-faint underline-offset-2 hover:text-danger hover:underline"
          onClick={() => {
            if (!canSave) focus.discard();
            else setConfirmDiscard(true);
          }}
        >
          Scarta la sessione
        </button>
        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={setConfirmDiscard}
          title="Scartare questa sessione?"
          description="Il tempo di concentrazione di questa sessione non verrà registrato."
          confirmLabel="Scarta"
          danger
          onConfirm={() => focus.discard()}
        />
      </div>
    </div>
  );
}
