import { useEffect, useState } from "react";
import { Target, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Kbd, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useApp } from "@/hooks/app";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { ValidationError, createTask, deleteTask, restoreTask, updateTask } from "@/db/repo";
import type { Task, TaskStatus } from "@/db/schema";
import { cn, errorMessage } from "@/lib/utils";

type Draft = {
  title: string;
  description: string;
  priority: "1" | "2" | "3";
  important: boolean;
  urgent: boolean;
  optional: boolean;
  domain: string;
  dueDate: string;
  scheduledDate: string;
  estimateMin: string;
  actualMin: string;
  status: TaskStatus;
  mission: boolean;
  notes: string;
  goalId: string;
};

function toDraft(t: Partial<Task> | undefined, fallbackDomain: string, today: string): Draft {
  return {
    title: t?.title ?? "",
    description: t?.description ?? "",
    priority: String(t?.priority ?? 2) as Draft["priority"],
    important: t?.important ?? false,
    urgent: t?.urgent ?? false,
    optional: t?.optional ?? false,
    domain: t?.domain ?? fallbackDomain,
    dueDate: t?.dueDate ?? "",
    scheduledDate: t?.scheduledDate ?? "",
    estimateMin: t?.estimateMin != null ? String(t.estimateMin) : "",
    actualMin: t?.actualMin ? String(t.actualMin) : "",
    status: t?.status ?? "todo",
    mission: t?.missionDate === today,
    notes: t?.notes ?? "",
    goalId: t?.goalId ?? "",
  };
}

function intOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export function TaskFormDialog() {
  const { taskDialog, closeTask, domains, today } = useApp();
  const toast = useToast();
  const editing = taskDialog.task;
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const [draft, setDraft] = useState<Draft>(() => toDraft(undefined, domains[0]?.id ?? "personal", today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (taskDialog.open) {
      setDraft(toDraft(taskDialog.task ?? (taskDialog.defaults as Partial<Task>), domains[0]?.id ?? "personal", today));
      setErrors({});
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDialog.open, taskDialog.task, taskDialog.defaults]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErrors({});
    setFormError(null);
    const estimate = intOrNull(draft.estimateMin);
    const actual = intOrNull(draft.actualMin) ?? 0;
    const localErrors: Record<string, string> = {};
    if (Number.isNaN(estimate) || (estimate != null && (estimate < 1 || estimate > 1440))) localErrors.estimateMin = "Inserisci minuti tra 1 e 1440";
    if (Number.isNaN(actual) || actual < 0) localErrors.actualMin = "Inserisci un numero di minuti positivo";
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      setBusy(false);
      return;
    }
    const wasMission = editing?.missionDate === today;
    const payload = {
      title: draft.title,
      description: draft.description,
      priority: Number(draft.priority) as 1 | 2 | 3,
      important: draft.important,
      urgent: draft.urgent,
      optional: draft.optional,
      domain: draft.domain,
      dueDate: draft.dueDate || null,
      scheduledDate: draft.mission ? today : draft.scheduledDate || null,
      estimateMin: estimate,
      actualMin: actual,
      status: draft.status,
      notes: draft.notes,
      goalId: draft.goalId || null,
      missionDate: draft.mission ? today : wasMission ? null : (editing?.missionDate ?? null),
    };
    try {
      if (editing) {
        await updateTask(editing.id, payload);
        toast.success("Attività aggiornata");
      } else {
        await createTask(payload);
        toast.success(draft.mission ? "Aggiunta alla Missione di oggi" : "Attività creata");
      }
      closeTask();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fieldErrors);
      else setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    const snap = await deleteTask(editing.id);
    closeTask();
    if (snap) toast.info("Attività eliminata", { label: "Annulla", run: () => restoreTask(snap).catch((e) => toast.error(errorMessage(e))) });
  }

  return (
    <Modal
      open={taskDialog.open}
      onOpenChange={(o) => !o && closeTask()}
      title={editing ? "Modifica attività" : "Nuova attività"}
      onSubmit={submit}
      size="md"
      footer={
        <>
          {editing ? (
            <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={remove}>
              <Trash2 /> Elimina
            </Button>
          ) : (
            <span className="mr-auto hidden items-center gap-1 text-[11px] text-faint sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>Enter</Kbd> per salvare
            </span>
          )}
          <Button variant="ghost" onClick={closeTask}>
            Annulla
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {editing ? "Salva modifiche" : "Crea attività"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={formError} />
        <Field label="Titolo" error={errors.title}>
          {(p) => <Input {...p} autoFocus value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="es. Finire la simulazione di chimica" maxLength={140} />}
        </Field>

        <div className="grid grid-cols-2 gap-3">
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
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Priorità</span>
            <Segmented
              label="Priorità"
              value={draft.priority}
              onChange={(v) => set("priority", v)}
              className="h-9 w-full items-stretch"
              options={[
                { value: "1", label: "Alta" },
                { value: "2", label: "Media" },
                { value: "3", label: "Bassa" },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Classificazione</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Classificazione">
            <FlagToggle
              active={draft.important}
              onClick={() => setDraft((d) => ({ ...d, important: !d.important, optional: !d.important ? false : d.optional }))}
              label="Importante"
              hint="Fa avanzare un obiettivo"
              tone="accent"
            />
            <FlagToggle active={draft.urgent} onClick={() => set("urgent", !draft.urgent)} label="Urgente" hint="Ha una scadenza vicina" tone="warn" />
            <FlagToggle
              active={draft.optional}
              onClick={() => setDraft((d) => ({ ...d, optional: !d.optional, important: !d.optional ? false : d.important }))}
              label="Facoltativo"
              hint="Bella da fare; nascosta nelle modalità concentrate"
              tone="neutral"
            />
          </div>
          {errors.optional ? <p className="text-xs text-danger">{errors.optional}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Scadenza" error={errors.dueDate}>
            {(p) => <Input {...p} type="date" value={draft.dueDate} onChange={(e) => set("dueDate", e.target.value)} />}
          </Field>
          <Field label="Pianifica per" hint="Il giorno in cui ci lavorerai" error={errors.scheduledDate}>
            {(p) => <Input {...p} type="date" value={draft.mission ? today : draft.scheduledDate} disabled={draft.mission} onChange={(e) => set("scheduledDate", e.target.value)} />}
          </Field>
          <Field label="Stima (min)" error={errors.estimateMin}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={1440} value={draft.estimateMin} onChange={(e) => set("estimateMin", e.target.value)} placeholder="45" />}
          </Field>
          <Field label="Tempo reale (min)" hint={editing ? "Le sessioni di focus lo aggiornano automaticamente" : "Tempo effettivamente impiegato"} error={errors.actualMin}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={0} value={draft.actualMin} onChange={(e) => set("actualMin", e.target.value)} placeholder="0" />}
          </Field>
        </div>

        {editing ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Stato</span>
            <Segmented
              label="Stato"
              value={draft.status}
              onChange={(v) => set("status", v)}
              className="w-full"
              options={[
                { value: "todo", label: "Da fare" },
                { value: "in_progress", label: "In corso" },
                { value: "done", label: "Fatto" },
              ]}
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => set("mission", !draft.mission)}
          aria-pressed={draft.mission}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
            draft.mission ? "border-accent/40 bg-accent-soft" : "border-line hover:border-line-strong",
          )}
        >
          <Target className={cn("size-4", draft.mission ? "text-accent" : "text-subtle")} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-fg">Aggiungi alla Missione di oggi</div>
            <div className="text-xs text-subtle">Una delle tre attività più importanti di oggi.</div>
          </div>
          <span className={cn("text-xs font-medium", draft.mission ? "text-accent" : "text-faint")}>{draft.mission ? "Aggiunta" : "No"}</span>
        </button>

        <Field label="Obiettivo collegato" error={errors.goalId}>
          {(p) => (
            <Select {...p} value={draft.goalId} onChange={(e) => set("goalId", e.target.value)}>
              <option value="">Nessuno</option>
              {(goals ?? [])
                .filter((g) => g.status === "active" || g.id === draft.goalId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Descrizione" error={errors.description}>
          {(p) => <Textarea {...p} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Come capisci che è finita?" rows={2} />}
        </Field>
        <Field label="Note" error={errors.notes}>
          {(p) => <Textarea {...p} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Facoltativo" rows={2} />}
        </Field>
      </div>
    </Modal>
  );
}

function FlagToggle({ active, onClick, label, hint, tone }: { active: boolean; onClick: () => void; label: string; hint: string; tone: "accent" | "warn" | "neutral" }) {
  const activeCls = tone === "accent" ? "border-accent/40 bg-accent-soft text-accent" : tone === "warn" ? "border-warn/40 bg-warn/10 text-warn" : "border-white/20 bg-white/[0.06] text-fg";
  return (
    <button
      type="button"
      aria-pressed={active}
      title={hint}
      onClick={onClick}
      className={cn("h-8 rounded-lg border px-3 text-xs font-medium transition-colors", active ? activeCls : "border-line text-subtle hover:border-line-strong hover:text-muted")}
    >
      {label}
    </button>
  );
}
