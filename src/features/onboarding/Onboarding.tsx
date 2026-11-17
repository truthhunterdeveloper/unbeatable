import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Domain, EventCategory, Settings } from "@/db/schema";
import { DOMAIN_PALETTE, EVENT_CATEGORIES, HABIT_TEMPLATES, defaultSettings } from "@/db/defaults";
import { ValidationError, createEvent, createHabit, saveSettings, uid, validate } from "@/db/repo";
import { SettingsSchema } from "@/db/schema";
import { WEEKDAY_LETTER, WEEKDAY_SHORT, formatDuration, listTimeZones, sleepMinutes, todayISO } from "@/lib/date";
import { requestNotificationPermission } from "@/lib/notify";
import { cn, errorMessage } from "@/lib/utils";
import { isNative } from "@/lib/native";

type Commitment = { key: string; title: string; category: EventCategory; days: number[]; start: string; end: string };

const QUICK_COMMITMENTS: Omit<Commitment, "key">[] = [
  { title: "Scuola", category: "school", days: [1, 2, 3, 4, 5], start: "08:30", end: "15:30" },
  { title: "Allenamento di calcio", category: "football", days: [2, 4], start: "17:30", end: "19:00" },
  { title: "Partita", category: "football", days: [6], start: "10:00", end: "12:00" },
  { title: "Arbitraggio", category: "refereeing", days: [0], start: "10:00", end: "12:00" },
  { title: "Blocco di studio", category: "study", days: [1, 2, 3, 4, 5], start: "16:30", end: "17:30" },
  { title: "Cena", category: "meal", days: [0, 1, 2, 3, 4, 5, 6], start: "19:30", end: "20:00" },
];

const STEPS = ["Tu", "Aree", "Ritmo", "Impegni", "Abitudini"] as const;

export function Onboarding({ existing }: { existing: Settings | null }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [s, setS] = useState<Settings>(() => existing ?? defaultSettings());
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [habitPicks, setHabitPicks] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => listTimeZones(), []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  function validateStep(i: number): boolean {
    const e: Record<string, string> = {};
    if (i === 0 && !s.name.trim()) e.name = "Inserisci il nome con cui vuoi essere chiamato";
    if (i === 1) {
      if (!s.domains.some((d) => d.enabled)) e.domains = "Mantieni almeno un'area di vita";
      s.domains.forEach((d, idx) => {
        if (!d.label.trim()) e[`domains.${idx}`] = "Dai un nome a quest'area";
      });
    }
    if (i === 2) {
      if (s.focusMinutes < 5 || s.focusMinutes > 180) e.focusMinutes = "Tra 5 e 180 minuti";
      if (s.breakMinutes < 1 || s.breakMinutes > 60) e.breakMinutes = "Tra 1 e 60 minuti";
      if (s.longFocusMinutes < 30 || s.longFocusMinutes > 240) e.longFocusMinutes = "Tra 30 e 240 minuti";
      if (!s.wakeTime) e.wakeTime = "Imposta l'orario della sveglia";
      if (!s.bedTime) e.bedTime = "Imposta l'orario per andare a letto";
    }
    if (i === 3) {
      commitments.forEach((c) => {
        if (!c.title.trim()) e[`c.${c.key}`] = "Dagli un titolo";
        else if (!c.days.length) e[`c.${c.key}`] = "Scegli almeno un giorno";
        else if (!c.start || !c.end || c.end <= c.start) e[`c.${c.key}`] = "La fine deve essere dopo l'inizio";
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((x) => Math.min(STEPS.length - 1, x + 1));
  }

  async function finish() {
    if (!validateStep(step)) return;
    setBusy(true);
    setFormError(null);
    try {
      const today = todayISO(s.timeZone);
      const final = validate(SettingsSchema, { ...s, name: s.name.trim(), onboardedAt: null });
      const enabled = final.domains.filter((d) => d.enabled);
      for (const c of commitments) {
        await createEvent({ title: c.title, category: c.category, start: c.start, end: c.end, date: today, repeatDays: c.days });
      }
      for (const i of [...habitPicks].sort((a, b) => a - b)) {
        const t = HABIT_TEMPLATES[i];
        const domain = enabled.some((d) => d.id === t.domain) ? t.domain : enabled[0].id;
        await createHabit({ ...t, domain, startDate: today });
      }
      // Writing onboardedAt last swaps the UI into the app.
      await saveSettings({ ...final, onboardedAt: Date.now() });
    } catch (e) {
      if (e instanceof ValidationError) setFormError(Object.values(e.fieldErrors)[0]);
      else setFormError(errorMessage(e));
      toast.error("Impossibile completare la configurazione");
    } finally {
      setBusy(false);
    }
  }

  const sleep = sleepMinutes(s.bedTime, s.wakeTime);

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-8 sm:py-14">
        <div className="mb-10 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-8" />
          <div>
            <div className="text-sm font-semibold tracking-tight">Unbeatable</div>
            <div className="text-[11px] text-subtle">La tua vita. I tuoi standard. La tua esecuzione.</div>
          </div>
        </div>

        <ol className="mb-8 flex gap-1.5" aria-label="Avanzamento configurazione">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <div className={cn("h-0.5 rounded-full transition-colors duration-300", i <= step ? "bg-fg" : "bg-white/10")} />
              <div className={cn("mt-2 text-[10px] font-medium tracking-wider uppercase", i === step ? "text-fg" : "text-faint")} aria-current={i === step ? "step" : undefined}>
                {label}
              </div>
            </li>
          ))}
        </ol>

        <div key={step} className="flex-1 animate-rise">
          {step === 0 && (
            <section className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.02em]">La disciplina si costruisce con l'azione ripetuta, non con l'emozione.</h1>
                <p className="mt-3 text-[13px] leading-relaxed text-subtle">
                  Qualche domanda per adattare il sistema alla tua settimana reale. Ogni risposta si può cambiare dopo nelle Impostazioni.
                </p>
              </div>
              <Field label="Come vuoi essere chiamato?" error={errors.name}>
                {(p) => <Input {...p} autoFocus value={s.name} maxLength={40} onChange={(e) => set("name", e.target.value)} placeholder="Nome" />}
              </Field>
              <Field label="Fuso orario" hint="Usato per “oggi”, il planner e lo storico.">
                {(p) => (
                  <Select {...p} value={s.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, " ")}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="flex gap-3 rounded-xl border border-line bg-white/[0.015] p-3.5">
                <Lock className="mt-0.5 size-4 shrink-0 text-subtle" />
                <p className="text-xs leading-relaxed text-subtle">
                  Tutto resta su questo dispositivo, nel database locale del browser. Nessun account, nessuna sincronizzazione cloud, nessun tracker. Puoi esportare o cancellare tutto quando vuoi.
                </p>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.02em]">Le tue aree di vita</h1>
                <p className="mt-2 text-[13px] text-subtle">Attività, abitudini e tempo sono organizzati in queste aree. Rinominale, disattivale o aggiungine di tue.</p>
              </div>
              <ul className="flex flex-col gap-2">
                {s.domains.map((d, idx) => (
                  <li key={d.id} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors", d.enabled ? "border-line-strong bg-white/[0.02]" : "border-line opacity-55")}>
                    <ColorPick color={d.color} onChange={(c) => set("domains", s.domains.map((x) => (x.id === d.id ? { ...x, color: c } : x)))} />
                    <input
                      aria-label="Nome dell'area"
                      value={d.label}
                      maxLength={32}
                      onChange={(e) => set("domains", s.domains.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)))}
                      className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-fg focus:outline-none"
                    />
                    {errors[`domains.${idx}`] ? <span className="text-xs text-danger">{errors[`domains.${idx}`]}</span> : null}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={d.enabled}
                      aria-label={`${d.enabled ? "Disattiva" : "Attiva"} ${d.label}`}
                      onClick={() => set("domains", s.domains.map((x) => (x.id === d.id ? { ...x, enabled: !x.enabled } : x)))}
                      className={cn("relative h-5 w-9 rounded-full transition-colors", d.enabled ? "bg-fg" : "bg-white/15")}
                    >
                      <span className={cn("absolute top-0.5 size-4 rounded-full bg-bg transition-all", d.enabled ? "left-[18px]" : "left-0.5")} />
                    </button>
                  </li>
                ))}
              </ul>
              {errors.domains ? <p className="text-xs text-danger">{errors.domains}</p> : null}
              <Button
                variant="ghost"
                className="self-start"
                onClick={() =>
                  set("domains", [
                    ...s.domains,
                    { id: `d-${uid().slice(0, 8)}`, label: "Nuova area", color: DOMAIN_PALETTE[s.domains.length % DOMAIN_PALETTE.length], enabled: true } satisfies Domain,
                  ])
                }
              >
                <Plus /> Aggiungi un'area
              </Button>
            </section>
          )}

          {step === 2 && (
            <section className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.02em]">Il tuo ritmo quotidiano</h1>
                <p className="mt-2 text-[13px] text-subtle">Il sonno è la base di tutto. Il planner ti avviserà quando i piani lo intaccano.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sveglia abituale" error={errors.wakeTime}>
                  {(p) => <Input {...p} type="time" value={s.wakeTime} onChange={(e) => set("wakeTime", e.target.value)} />}
                </Field>
                <Field label="Ora abituale di andare a letto" error={errors.bedTime}>
                  {(p) => <Input {...p} type="time" value={s.bedTime} onChange={(e) => set("bedTime", e.target.value)} />}
                </Field>
              </div>
              <p className={cn("-mt-2 text-xs", sleep < 480 ? "text-warn" : "text-subtle")}>
                {formatDuration(sleep)} of sleep.{" "}
                {sleep < 480 ? "Sotto le 8–10 ore raccomandate per gli adolescenti: valuta di andare a letto prima." : "Nelle 8–10 ore raccomandate per gli adolescenti."}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Blocco di focus (min)" error={errors.focusMinutes}>
                  {(p) => <Input {...p} type="number" min={5} max={180} value={s.focusMinutes} onChange={(e) => set("focusMinutes", Number(e.target.value))} />}
                </Field>
                <Field label="Pausa (min)" error={errors.breakMinutes}>
                  {(p) => <Input {...p} type="number" min={1} max={60} value={s.breakMinutes} onChange={(e) => set("breakMinutes", Number(e.target.value))} />}
                </Field>
                <Field label="Sessione lunga (min)" error={errors.longFocusMinutes}>
                  {(p) => <Input {...p} type="number" min={30} max={240} value={s.longFocusMinutes} onChange={(e) => set("longFocusMinutes", Number(e.target.value))} />}
                </Field>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5">
                <input
                  type="checkbox"
                  aria-label="Notifiche del browser"
                  className="mt-0.5 accent-[#d4d4d4]"
                  checked={s.notifications}
                  onChange={async (e) => {
                    const on = e.target.checked;
                    if (on) {
                      const perm = await requestNotificationPermission();
                      if (perm !== "granted") {
                        toast.info(perm === "unsupported" ? "Questo browser non supporta le notifiche." : "Il browser non ha consentito le notifiche.");
                        set("notifications", false);
                        return;
                      }
                    }
                    set("notifications", on);
                  }}
                />
                <span>
                  <span className="block text-[13px] text-fg">Notifiche del browser</span>
                  <span className="block text-xs text-subtle">{isNative ? "Per la fine delle sessioni di focus e i promemoria delle abitudini. Arrivano anche con l'app chiusa." : "Per i timer di focus e i promemoria delle abitudini. Nel browser funzionano solo con l'app aperta in una scheda."}</span>
                </span>
              </label>
            </section>
          )}

          {step === 3 && (
            <section className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.02em]">Impegni fissi</h1>
                <p className="mt-2 text-[13px] text-subtle">
                  Scuola, allenamenti, arbitraggio, preghiera o studio che si ripetono ogni settimana. Diventano blocchi ricorrenti nel planner. Puoi saltare questo passo e aggiungerli dopo.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_COMMITMENTS.map((q) => (
                  <Button key={q.title} size="sm" variant="secondary" onClick={() => setCommitments((cs) => [...cs, { ...q, key: uid() }])}>
                    <Plus /> {q.title}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setCommitments((cs) => [...cs, { key: uid(), title: "", category: "other", days: [1], start: "16:00", end: "17:00" }])}>
                  <Plus /> Personalizzato
                </Button>
              </div>
              {commitments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-subtle">Nessun impegno ancora. Aggiungi quelli che danno forma alla tua settimana.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {commitments.map((c) => (
                    <li key={c.key} className="rounded-xl border border-line-strong bg-white/[0.02] p-3">
                      <div className="flex items-center gap-2">
                        <Input aria-label="Titolo" value={c.title} onChange={(e) => setCommitments((cs) => cs.map((x) => (x.key === c.key ? { ...x, title: e.target.value } : x)))} placeholder="Titolo" className="h-8" />
                        <Select
                          aria-label="Categoria"
                          value={c.category}
                          onChange={(e) => setCommitments((cs) => cs.map((x) => (x.key === c.key ? { ...x, category: e.target.value as EventCategory } : x)))}
                          className="h-8 w-32"
                        >
                          {EVENT_CATEGORIES.map((ec) => (
                            <option key={ec.id} value={ec.id}>
                              {ec.label}
                            </option>
                          ))}
                        </Select>
                        <Button variant="ghost" size="icon-sm" aria-label="Rimuovi" onClick={() => setCommitments((cs) => cs.filter((x) => x.key !== c.key))}>
                          <X />
                        </Button>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <DayPicker value={c.days} onChange={(days) => setCommitments((cs) => cs.map((x) => (x.key === c.key ? { ...x, days } : x)))} />
                        <div className="ml-auto flex items-center gap-1.5">
                          <Input aria-label="Inizio" type="time" value={c.start} onChange={(e) => setCommitments((cs) => cs.map((x) => (x.key === c.key ? { ...x, start: e.target.value } : x)))} className="h-8 w-[124px]" />
                          <span className="text-faint">–</span>
                          <Input aria-label="Fine" type="time" value={c.end} onChange={(e) => setCommitments((cs) => cs.map((x) => (x.key === c.key ? { ...x, end: e.target.value } : x)))} className="h-8 w-[124px]" />
                        </div>
                      </div>
                      {errors[`c.${c.key}`] ? <p className="mt-2 text-xs text-danger">{errors[`c.${c.key}`]}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="flex flex-col gap-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.02em]">Abitudini iniziali</h1>
                <p className="mt-2 text-[13px] text-subtle">
                  Parti in piccolo: due o tre abitudini che mantieni valgono più di dieci che abbandoni. Ogni dettaglio è modificabile nella pagina Abitudini.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {HABIT_TEMPLATES.map((t, i) => {
                  const on = habitPicks.has(i);
                  const d = s.domains.find((x) => x.id === t.domain && x.enabled);
                  return (
                    <li key={t.name}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setHabitPicks((p) => {
                            const n = new Set(p);
                            if (n.has(i)) n.delete(i);
                            else n.add(i);
                            return n;
                          })
                        }
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                          on ? "border-white/25 bg-white/[0.05]" : "border-line hover:border-line-strong",
                        )}
                      >
                        <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-md border transition-colors", on ? "border-transparent bg-fg" : "border-white/25")}>
                          <Check className={cn("size-3 stroke-[3] text-bg", on ? "opacity-100" : "opacity-0")} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-fg">{t.name}</span>
                          <span className="block truncate text-xs text-subtle">
                            {t.target > 1 ? `${t.target} ${t.unit} · ` : ""}
                            {t.frequency.type === "daily" ? "Ogni giorno" : t.frequency.type === "weekly" ? `${t.frequency.timesPerWeek}× a settimana` : t.frequency.days.map((x) => WEEKDAY_SHORT[x]).join(" ")}
                            {" · "}
                            {t.tier === "essential" ? "Essenziale" : t.tier === "optional" ? "Bonus facoltativo" : "Standard"}
                          </span>
                        </span>
                        {d ? <span className="size-2 rounded-full" style={{ background: d.color }} aria-hidden /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <FormError message={formError} />
            </section>
          )}
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}>
            <ArrowLeft /> Indietro
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Continua <ArrowRight />
            </Button>
          ) : (
            <Button variant="primary" onClick={finish} disabled={busy}>
              {busy ? "Configurazione…" : "Entra in Unbeatable"} <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  // Display Monday first.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="flex gap-1" role="group" aria-label="Giorni della settimana">
      {order.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={WEEKDAY_SHORT[d]}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={cn("grid size-7 place-items-center rounded-md text-[11px] font-medium transition-colors", on ? "bg-fg text-bg" : "bg-white/[0.04] text-subtle hover:text-fg")}
          >
            {WEEKDAY_LETTER[d]}
          </button>
        );
      })}
    </div>
  );
}

export function ColorPick({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-label="Cambia colore" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-6 place-items-center rounded-md hover:bg-white/5">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
      </button>
      {open ? (
        <div className="absolute top-8 left-0 z-10 flex gap-1.5 rounded-lg border border-line-strong bg-elevated p-2 shadow-xl">
          {DOMAIN_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cn("size-5 rounded-full ring-offset-2 ring-offset-elevated", c === color && "ring-2 ring-white/60")}
              style={{ background: c }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
