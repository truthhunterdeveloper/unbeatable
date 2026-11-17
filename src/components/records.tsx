import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/db/db";
import type { DomainRecord } from "@/db/schema";
import { RECORD_TYPES, type FieldDef } from "@/db/records";
import { ValidationError, deleteRecord, restoreRecord, saveRecord } from "@/db/repo";
import { useApp } from "@/hooks/app";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, CardHeader, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { relativeDay } from "@/lib/date";
import { cn, errorMessage } from "@/lib/utils";

/* ───────── Data hooks ───────── */

export function useRecords(types: string[]) {
  const key = types.join(",");
  return useLiveQuery(() => db.records.where("type").anyOf(types).toArray(), [key]);
}

/** Resolves a referenced record id (subject, project…) to its display title. */
export function useRefLabel() {
  const refs = useLiveQuery(() => db.records.where("type").anyOf(["subject", "project"]).toArray(), []);
  return useCallback(
    (id: unknown) => {
      const r = refs?.find((x) => x.id === id);
      return r ? RECORD_TYPES[r.type].title(r.data, () => "") : "";
    },
    [refs],
  );
}

/* ───────── Form ───────── */

export type RecordDialogState = { open: boolean; type: string; record?: DomainRecord; defaults?: Record<string, unknown>; date?: string };

function initialData(fields: FieldDef[], rec?: DomainRecord, defaults?: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = rec?.data[f.key] ?? defaults?.[f.key] ?? f.initial;
    out[f.key] = v ?? (f.kind === "multi" ? [] : f.kind === "bool" ? false : "");
  }
  return out;
}

/** Converts form state into the typed shape the schema expects. */
function toData(fields: FieldDef[], form: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = form[f.key];
    if (f.kind === "number" || f.kind === "rating" || f.kind === "scale10") {
      out[f.key] = v === "" || v == null ? (f.required ? NaN : null) : Number(v);
    } else if (f.kind === "select" || f.kind === "ref") {
      out[f.key] = v === "" || v == null ? (f.required ? "" : null) : v;
      if (out[f.key] === null) delete out[f.key];
    } else out[f.key] = v;
  }
  return out;
}

export function RecordFormDialog({ state, onClose }: { state: RecordDialogState; onClose: () => void }) {
  const { today } = useApp();
  const toast = useToast();
  const def = RECORD_TYPES[state.type];
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refTypes = useMemo(() => def?.fields.filter((f) => f.kind === "ref").map((f) => f.refType!) ?? [], [def]);
  const refRecords = useLiveQuery(() => (refTypes.length ? db.records.where("type").anyOf(refTypes).toArray() : Promise.resolve([] as DomainRecord[])), [refTypes.join()]);

  useEffect(() => {
    if (state.open && def) {
      setForm(initialData(def.fields, state.record, state.defaults));
      setDate(state.record?.date ?? state.date ?? today);
      setErrors({});
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.record, state.type]);

  if (!def) return null;
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    try {
      await saveRecord({ id: state.record?.id, type: state.type, date, data: toData(def.fields, form) });
      toast.success(state.record ? "Salvato" : `${def.noun[0].toUpperCase()}${def.noun.slice(1)}: registrato`);
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.fieldErrors)) {
          const f = def.fields.find((x) => x.key === k);
          mapped[k] = f && /expected|invalid|nan/i.test(v) ? `Valore non valido: ${f.label.toLowerCase()}` : v;
        }
        setErrors(mapped);
      } else setFormError(errorMessage(e));
    }
  }

  async function remove() {
    if (!state.record) return;
    const r = await deleteRecord(state.record.id);
    onClose();
    if (r) toast.info("Eliminato", { label: "Annulla", run: () => restoreRecord(r).catch((e) => toast.error(errorMessage(e))) });
  }

  return (
    <Modal
      open={state.open}
      onOpenChange={(o) => !o && onClose()}
      title={state.record ? `Modifica ${def.noun}` : `Registra ${def.noun}`}
      onSubmit={submit}
      footer={
        <>
          {state.record ? (
            <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={remove}>
              <Trash2 /> Elimina
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button variant="primary" type="submit">
            Salva
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={formError} />
        <Field label={def.dateLabel} error={errors.date}>
          {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        {def.fields.map((f) => (
          <FieldControl key={f.key} f={f} value={form[f.key]} error={errors[f.key]} onChange={(v) => set(f.key, v)} refRecords={refRecords?.filter((r) => r.type === f.refType) ?? []} />
        ))}
      </div>
    </Modal>
  );
}

function FieldControl({ f, value, error, onChange, refRecords }: { f: FieldDef; value: unknown; error?: string; onChange: (v: unknown) => void; refRecords: DomainRecord[] }) {
  const label = f.required ? f.label : f.label;
  if (f.kind === "rating" || f.kind === "scale10") {
    const n = f.kind === "rating" ? 5 : 10;
    const options = [
      ...(f.required ? [] : [{ value: "", label: "—" }]),
      ...Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    ];
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        <Segmented label={f.label} value={value == null ? "" : String(value)} onChange={(v) => onChange(v)} options={options} className="w-full" size={n > 5 ? "sm" : "md"} />
        {error ? <p className="text-xs text-danger">{error}</p> : f.hint ? <p className="text-xs text-subtle">{f.hint}</p> : null}
      </div>
    );
  }
  if (f.kind === "multi") {
    const arr = (value as string[]) ?? [];
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.label}>
          {f.options!.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                className={cn("h-7 rounded-md border px-2.5 text-xs transition-colors", on ? "border-white/25 bg-white/[0.08] text-fg" : "border-line text-subtle hover:text-muted")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (f.kind === "bool") {
    return (
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
        <input type="checkbox" className="accent-[#d4d4d4]" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {f.label}
      </label>
    );
  }
  return (
    <Field label={label} error={error} hint={f.hint}>
      {(p) =>
        f.kind === "textarea" ? (
          <Textarea {...p} rows={3} value={String(value ?? "")} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
        ) : f.kind === "select" || f.kind === "ref" ? (
          <Select {...p} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
            {!f.required || f.kind === "ref" ? <option value="">{f.kind === "ref" ? (refRecords.length ? "Choose…" : `Nessun elemento ancora`) : "—"}</option> : null}
            {(f.kind === "ref" ? refRecords.map((r) => ({ value: r.id, label: RECORD_TYPES[r.type].title(r.data, () => "") })) : f.options!).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            {...p}
            type={f.kind === "number" ? "number" : "text"}
            inputMode={f.kind === "number" ? "decimal" : undefined}
            step={f.kind === "number" ? "any" : undefined}
            value={String(value ?? "")}
            placeholder={f.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

/* ───────── List section ───────── */

export function RecordRows({ records, onEdit, showType, limit = 50 }: { records: DomainRecord[]; onEdit: (r: DomainRecord) => void; showType?: boolean; limit?: number }) {
  const { today } = useApp();
  const ref = useRefLabel();
  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)).slice(0, limit);
  return (
    <ul>
      {sorted.map((r) => {
        const def = RECORD_TYPES[r.type];
        const summary = def.summary(r.data, ref);
        return (
          <li key={r.id}>
            <button onClick={() => onEdit(r)} className="group flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.03]">
              <span className="w-16 shrink-0 pt-px text-[11px] text-subtle tabular">{relativeDay(r.date, today)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] text-fg">{def.title(r.data, ref) || def.label}</span>
                  {showType ? <Badge>{def.label}</Badge> : null}
                </span>
                {summary ? <span className="mt-0.5 block truncate text-[11px] text-subtle">{summary}</span> : null}
              </span>
              <Pencil className="mt-0.5 size-3.5 shrink-0 text-faint opacity-0 group-hover:opacity-100" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A card listing one or more record types, with its own add/edit dialog. */
export function RecordSection({
  title,
  types,
  icon,
  empty,
  children,
  limit,
  className,
  defaults,
}: {
  title: string;
  types: string[];
  icon?: ReactNode;
  empty: string;
  children?: ReactNode;
  limit?: number;
  className?: string;
  defaults?: Record<string, unknown>;
}) {
  const records = useRecords(types);
  const [dialog, setDialog] = useState<RecordDialogState>({ open: false, type: types[0] });
  const [addType, setAddType] = useState(types[0]);
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        icon={icon}
        action={
          <div className="flex items-center gap-1">
            {types.length > 1 ? (
              <Select aria-label="Tipo di registrazione" value={addType} onChange={(e) => setAddType(e.target.value)} className="h-7 w-auto text-xs">
                {types.map((t) => (
                  <option key={t} value={t}>
                    {RECORD_TYPES[t].label}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setDialog({ open: true, type: addType, defaults })}>
              <Plus /> {types.length > 1 ? "Registra" : `Registra ${RECORD_TYPES[types[0]].noun}`}
            </Button>
          </div>
        }
      />
      {children}
      <div className="px-1.5 pb-1.5">
        {!records ? (
          <Skeleton className="m-2 h-16" />
        ) : records.length === 0 ? (
          <EmptyState title={empty} className="py-6" />
        ) : (
          <RecordRows records={records} showType={types.length > 1} limit={limit} onEdit={(r) => setDialog({ open: true, type: r.type, record: r })} />
        )}
      </div>
      <RecordFormDialog state={dialog} onClose={() => setDialog((d) => ({ ...d, open: false }))} />
    </Card>
  );
}
