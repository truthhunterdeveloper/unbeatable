import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useTasks } from "@/hooks/data";
import { DayPicker } from "@/features/onboarding/Onboarding";
import { EVENT_CATEGORIES } from "@/db/defaults";
import type { EventCategory, PlannerEvent } from "@/db/schema";
import { ValidationError, createEvent, deleteEvent, restoreEvent, skipOccurrence, updateEvent } from "@/db/repo";
import { formatShort, minToHm, weekday } from "@/lib/date";
import { errorMessage } from "@/lib/utils";

export type EventDialogState = { open: boolean; event?: PlannerEvent; date: string; start?: number };

type Draft = { title: string; category: EventCategory; date: string; start: string; end: string; repeat: "none" | "weekly"; days: number[]; until: string; taskId: string; notes: string };

export function EventFormDialog({ state, onClose }: { state: EventDialogState; onClose: () => void }) {
  const toast = useToast();
  const tasks = useTasks();
  const ev = state.event;
  const [d, setD] = useState<Draft>(blank(state));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (state.open) {
      setD(
        ev
          ? {
              title: ev.title,
              category: ev.category,
              date: ev.date,
              start: ev.start,
              end: ev.end,
              repeat: ev.repeatDays.length ? "weekly" : "none",
              days: ev.repeatDays.length ? ev.repeatDays : [weekday(ev.date)],
              until: ev.until ?? "",
              taskId: ev.taskId ?? "",
              notes: ev.notes,
            }
          : blank(state),
      );
      setErrors({});
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, ev]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit() {
    const payload = {
      title: d.title,
      category: d.category,
      date: d.date,
      start: d.start,
      end: d.end,
      repeatDays: d.repeat === "weekly" ? d.days : [],
      until: d.repeat === "weekly" && d.until ? d.until : null,
      taskId: d.taskId || null,
      notes: d.notes,
    };
    if (d.repeat === "weekly" && d.days.length === 0) {
      setErrors({ repeatDays: "Scegli almeno un giorno" });
      return;
    }
    try {
      if (ev) await updateEvent(ev.id, payload);
      else await createEvent(payload);
      toast.success(ev ? "Blocco aggiornato" : "Blocco aggiunto");
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fieldErrors);
      else setFormError(errorMessage(e));
    }
  }

  const recurring = !!ev && ev.repeatDays.length > 0;

  return (
    <Modal
      open={state.open}
      onOpenChange={(o) => !o && onClose()}
      title={ev ? "Modifica blocco" : "Nuovo blocco"}
      description={recurring ? "Le modifiche valgono per tutte le ripetizioni di questa serie." : "Pianifica impegni reali. Lascia spazio agli imprevisti."}
      onSubmit={submit}
      footer={
        <>
          {ev ? (
            <div className="mr-auto flex gap-1">
              {recurring ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await skipOccurrence(ev.id, state.date);
                    toast.info(`Rimosso solo ${formatShort(state.date)}`);
                    onClose();
                  }}
                >
                  Salta {formatShort(state.date)}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="text-danger hover:text-danger"
                onClick={async () => {
                  const removed = await deleteEvent(ev.id);
                  onClose();
                  if (removed) toast.info(recurring ? "Serie eliminata" : "Blocco eliminato", { label: "Annulla", run: () => restoreEvent(removed) });
                }}
              >
                <Trash2 /> {recurring ? "Elimina serie" : "Elimina"}
              </Button>
            </div>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button variant="primary" type="submit">
            {ev ? "Salva" : "Aggiungi blocco"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={formError} />
        <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
          <Field label="Titolo" error={errors.title}>
            {(p) => <Input {...p} autoFocus value={d.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="es. Allenamento, ripasso di matematica, Jumu'ah" />}
          </Field>
          <Field label="Categoria" error={errors.category}>
            {(p) => (
              <Select {...p} value={d.category} onChange={(e) => set("category", e.target.value as EventCategory)}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={d.repeat === "weekly" ? "Inizia il" : "Data"} error={errors.date}>
            {(p) => <Input {...p} type="date" value={d.date} onChange={(e) => set("date", e.target.value)} />}
          </Field>
          <Field label="Inizio" error={errors.start}>
            {(p) => <Input {...p} type="time" value={d.start} onChange={(e) => set("start", e.target.value)} />}
          </Field>
          <Field label="Fine" error={errors.end}>
            {(p) => <Input {...p} type="time" value={d.end} onChange={(e) => set("end", e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Ripeti</span>
          <Segmented
            label="Ripeti"
            value={d.repeat}
            onChange={(v) => setD((x) => ({ ...x, repeat: v, days: x.days.length ? x.days : [weekday(x.date)] }))}
            className="self-start"
            options={[
              { value: "none", label: "Una volta" },
              { value: "weekly", label: "Ogni settimana" },
            ]}
          />
          {d.repeat === "weekly" ? (
            <div className="flex flex-wrap items-center gap-3">
              <DayPicker value={d.days} onChange={(days) => set("days", days)} />
              <div className="flex items-center gap-2 text-xs text-subtle">
                until
                <Input aria-label="Ripeti fino al" type="date" value={d.until} min={d.date} onChange={(e) => set("until", e.target.value)} className="h-8 w-auto" />
              </div>
              {errors.repeatDays ? <p className="w-full text-xs text-danger">{errors.repeatDays}</p> : null}
              {errors.until ? <p className="w-full text-xs text-danger">{errors.until}</p> : null}
            </div>
          ) : null}
        </div>
        <Field label="Attività collegata (facoltativa)" hint="La sua stima viene coperta da questo blocco, senza contarla due volte.">
          {(p) => (
            <Select {...p} value={d.taskId} onChange={(e) => set("taskId", e.target.value)}>
              <option value="">Nessuno</option>
              {(tasks ?? [])
                .filter((t) => t.status !== "done" || t.id === d.taskId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Note" error={errors.notes}>
          {(p) => <Textarea {...p} rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Facoltativo" />}
        </Field>
      </div>
    </Modal>
  );
}

function blank(state: EventDialogState): Draft {
  const start = state.start ?? 16 * 60;
  return {
    title: "",
    category: "study",
    date: state.date,
    start: minToHm(start),
    end: minToHm(Math.min(start + 60, 23 * 60 + 59)),
    repeat: "none",
    days: [weekday(state.date)],
    until: "",
    taskId: "",
    notes: "",
  };
}
