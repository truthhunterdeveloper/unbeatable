import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useApp } from "@/hooks/app";
import { DayPicker } from "@/features/onboarding/Onboarding";
import type { Frequency, Habit, HabitTier } from "@/db/schema";
import { ValidationError, archiveHabit, createHabit, deleteHabit, updateHabit } from "@/db/repo";
import { cn, errorMessage } from "@/lib/utils";

type Draft = {
  name: string;
  description: string;
  domain: string;
  freqType: Frequency["type"];
  days: number[];
  timesPerWeek: string;
  target: string;
  unit: string;
  estimateMin: string;
  tier: HabitTier;
  reminderTime: string;
  startDate: string;
  notes: string;
};

const TIERS: { value: HabitTier; label: string; help: string }[] = [
  { value: "essential", label: "Essenziale", help: "Mantenuta in ogni modalità, anche in Recupero." },
  { value: "standard", label: "Standard", help: "Prevista in Standard e Alta intensità; sospesa in Recupero." },
  { value: "optional", label: "Facoltativo", help: "Sempre un bonus. Mai conteggiata come mancata." },
];

function toDraft(h: Habit | undefined, domain: string, today: string): Draft {
  return {
    name: h?.name ?? "",
    description: h?.description ?? "",
    domain: h?.domain ?? domain,
    freqType: h?.frequency.type ?? "daily",
    days: h?.frequency.type === "days" ? h.frequency.days : [1, 2, 3, 4, 5],
    timesPerWeek: h?.frequency.type === "weekly" ? String(h.frequency.timesPerWeek) : "3",
    target: String(h?.target ?? 1),
    unit: h?.unit ?? "",
    estimateMin: h?.estimateMin != null ? String(h.estimateMin) : "",
    tier: h?.tier ?? "standard",
    reminderTime: h?.reminderTime ?? "",
    startDate: h?.startDate ?? today,
    notes: h?.notes ?? "",
  };
}

export function HabitFormDialog({ open, onOpenChange, habit }: { open: boolean; onOpenChange: (o: boolean) => void; habit?: Habit }) {
  const { domains, today } = useApp();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(habit, domains[0]?.id ?? "personal", today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(habit, domains[0]?.id ?? "personal", today));
      setErrors({});
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit() {
    setErrors({});
    setFormError(null);
    const frequency: Frequency =
      draft.freqType === "daily" ? { type: "daily" } : draft.freqType === "days" ? { type: "days", days: draft.days } : { type: "weekly", timesPerWeek: Number(draft.timesPerWeek) };
    const estimate = draft.estimateMin.trim() === "" ? null : Number(draft.estimateMin);
    const payload = {
      name: draft.name,
      description: draft.description,
      domain: draft.domain,
      frequency,
      target: Number(draft.target),
      unit: draft.unit,
      estimateMin: estimate,
      tier: draft.tier,
      reminderTime: draft.reminderTime || null,
      startDate: draft.startDate,
      notes: draft.notes,
    };
    try {
      if (habit) {
        await updateHabit(habit.id, payload);
        toast.success("Abitudine aggiornata");
      } else {
        await createHabit(payload);
        toast.success("Abitudine creata");
      }
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ValidationError) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.fieldErrors)) {
          if (k.startsWith("frequency.days")) mapped.days = v;
          else if (k.startsWith("frequency.timesPerWeek")) mapped.timesPerWeek = v;
          else mapped[k] = v;
        }
        if (mapped.estimateMin) mapped.estimateMin = "Inserisci minuti tra 1 e 600";
        if (mapped.target) mapped.target = "Inserisci un numero intero da 1";
        setErrors(mapped);
      } else setFormError(errorMessage(e));
    }
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={habit ? "Modifica abitudine" : "Nuova abitudine"}
        description="Piccola, specifica e ripetibile batte ambiziosa e occasionale."
        onSubmit={submit}
        footer={
          <>
            {habit ? (
              <div className="mr-auto flex gap-1">
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await archiveHabit(habit.id, !habit.archived);
                      toast.success(habit.archived ? "Abitudine ripristinata" : "Abitudine archiviata — storico conservato");
                      onOpenChange(false);
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  {habit.archived ? <ArchiveRestore /> : <Archive />}
                  {habit.archived ? "Ripristina" : "Archivia"}
                </Button>
                <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Elimina
                </Button>
              </div>
            ) : null}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button variant="primary" type="submit">
              {habit ? "Salva modifiche" : "Crea abitudine"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FormError message={formError} />
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Nome" error={errors.name}>
              {(p) => <Input {...p} autoFocus value={draft.name} maxLength={60} onChange={(e) => set("name", e.target.value)} placeholder="es. Leggere il Corano" />}
            </Field>
            <Field label="Area di vita" error={errors.domain}>
              {(p) => (
                <Select {...p} value={draft.domain} onChange={(e) => set("domain", e.target.value)}>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">Frequenza</span>
            <Segmented
              label="Frequenza"
              value={draft.freqType}
              onChange={(v) => set("freqType", v)}
              className="self-start"
              options={[
                { value: "daily", label: "Ogni giorno" },
                { value: "days", label: "Giorni specifici" },
                { value: "weekly", label: "Volte a settimana" },
              ]}
            />
            {draft.freqType === "days" ? (
              <div>
                <DayPicker value={draft.days} onChange={(d) => set("days", d)} />
                {errors.days ? <p className="mt-1.5 text-xs text-danger">{errors.days}</p> : null}
              </div>
            ) : null}
            {draft.freqType === "weekly" ? (
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <Input aria-label="Volte a settimana" type="number" min={1} max={7} value={draft.timesPerWeek} onChange={(e) => set("timesPerWeek", e.target.value)} className="h-8 w-16" />
                volte a settimana, in qualsiasi giorno
                {errors.timesPerWeek ? <span className="text-xs text-danger">{errors.timesPerWeek}</span> : null}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Obiettivo giornaliero" error={errors.target} hint="Anche il parziale conta">
              {(p) => <Input {...p} type="number" min={1} max={1000} value={draft.target} onChange={(e) => set("target", e.target.value)} />}
            </Field>
            <Field label="Unità" error={errors.unit} hint="es. pagine, preghiere">
              {(p) => <Input {...p} value={draft.unit} maxLength={16} onChange={(e) => set("unit", e.target.value)} placeholder="facoltativo" />}
            </Field>
            <Field label="Durata (min)" error={errors.estimateMin}>
              {(p) => <Input {...p} type="number" min={1} max={600} value={draft.estimateMin} onChange={(e) => set("estimateMin", e.target.value)} placeholder="—" />}
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">Livello di priorità</span>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Livello di priorità">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.tier === t.value}
                  onClick={() => set("tier", t.value)}
                  className={cn(
                    "rounded-xl border p-2.5 text-left transition-colors",
                    draft.tier === t.value ? "border-white/25 bg-white/[0.05]" : "border-line hover:border-line-strong",
                  )}
                >
                  <div className="text-[13px] font-medium text-fg">{t.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-subtle">{t.help}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Promemoria" error={errors.reminderTime} hint="Funziona solo con l'app aperta">
              {(p) => <Input {...p} type="time" value={draft.reminderTime} onChange={(e) => set("reminderTime", e.target.value)} />}
            </Field>
            <Field label="Traccia dal" error={errors.startDate} hint="I giorni precedenti non vengono contati">
              {(p) => <Input {...p} type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} />}
            </Field>
          </div>

          <Field label="Descrizione" error={errors.description}>
            {(p) => <Input {...p} value={draft.description} maxLength={500} onChange={(e) => set("description", e.target.value)} placeholder="Perché conta, o cosa vale come fatto" />}
          </Field>
          <Field label="Note" error={errors.notes}>
            {(p) => <Textarea {...p} value={draft.notes} rows={2} onChange={(e) => set("notes", e.target.value)} placeholder="Facoltativo" />}
          </Field>
        </div>
      </Modal>
      {habit ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Eliminare questa abitudine?"
          danger
          confirmLabel="Elimina abitudine e storico"
          description={
            <>
              This permanently removes <span className="text-fg">{habit.name}</span> and its entire completion history. To keep the history, archive it instead.
            </>
          }
          onConfirm={async () => {
            await deleteHabit(habit.id);
            toast.info("Abitudine eliminata");
            onOpenChange(false);
          }}
        />
      ) : null}
    </>
  );
}
