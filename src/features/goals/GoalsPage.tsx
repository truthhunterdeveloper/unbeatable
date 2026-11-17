import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "react-router";
import { Check, ChevronRight, Flag, Pencil, Plus, Trash2, X } from "lucide-react";
import { db } from "@/db/db";
import type { Goal, GoalLevel } from "@/db/schema";
import { ValidationError, addCheckin, createGoal, deleteGoal, removeCheckin, uid, updateGoal } from "@/db/repo";
import { useApp } from "@/hooks/app";
import { QuoteCard } from "@/components/QuoteCard";
import { useTasks } from "@/hooks/data";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, DomainDot, EmptyState, PageHeader, ProgressBar, Segmented, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { TaskRow } from "@/features/tasks/TaskRow";
import { GOAL_LEVELS, childLevel, goalProgress, type GoalProgress } from "@/lib/domains";
import { formatDayMonth, relativeDay } from "@/lib/date";
import { cn, errorMessage, pct } from "@/lib/utils";

export function useGoals() {
  return useLiveQuery(() => db.goals.toArray(), []);
}

const STATUS_LABEL: Record<Goal["status"], string> = { active: "Attivo", achieved: "Raggiunto", missed: "Non raggiunto", paused: "In pausa" };
const PACE: Record<NonNullable<GoalProgress["pace"]>, { label: string; tone: "ok" | "warn" | "accent" }> = {
  ahead: { label: "In anticipo", tone: "accent" },
  "on-track": { label: "In linea", tone: "ok" },
  behind: { label: "In ritardo", tone: "warn" },
};

export function GoalsPage() {
  const goals = useGoals();
  const tasks = useTasks();
  const { today, domains } = useApp();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<{ open: boolean; goal?: Goal; defaults?: Partial<Goal> }>({ open: false });
  const [detail, setDetail] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (params.get("new") === "1") {
      setForm({ open: true });
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const visible = useMemo(
    () => (goals ?? []).filter((g) => (domainFilter === "all" || g.domain === domainFilter) && (statusFilter === "all" || g.status === "active" || g.status === "paused")),
    [goals, domainFilter, statusFilter],
  );
  const ids = new Set(visible.map((g) => g.id));
  const roots = visible.filter((g) => !g.parentId || !ids.has(g.parentId));
  const order = (a: Goal, b: Goal) => GOAL_LEVELS.findIndex((l) => l.id === a.level) - GOAL_LEVELS.findIndex((l) => l.id === b.level) || (a.targetDate ?? "9") .localeCompare(b.targetDate ?? "9");

  const renderNode = (g: Goal, depth: number): React.ReactNode => {
    const kids = visible.filter((k) => k.parentId === g.id).sort(order);
    const open = !collapsed.has(g.id);
    return (
      <div key={g.id}>
        <GoalRow
          goal={g}
          depth={depth}
          p={goalProgress(g, tasks ?? [], today)}
          kids={kids.length}
          open={open}
          onToggle={() =>
            setCollapsed((c) => {
              const n = new Set(c);
              if (n.has(g.id)) n.delete(g.id);
              else n.add(g.id);
              return n;
            })
          }
          onOpen={() => setDetail(g.id)}
        />
        {open ? kids.map((k) => renderNode(k, depth + 1)) : null}
      </div>
    );
  };

  const current = goals?.find((g) => g.id === detail);

  return (
    <div>
      <PageHeader
        title="Obiettivi"
        description="Visione → obiettivi annuali → trimestrali → mensili → settimanali → azioni quotidiane. Il progresso arriva solo da misure registrate o traguardi completati."
        actions={
          <Button variant="primary" onClick={() => setForm({ open: true })}>
            <Plus /> Nuovo obiettivo
          </Button>
        }
      />
      <QuoteCard areas={["comeback", "discipline"]} rotate className="mb-5" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented
          label="Stato"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "active", label: "In corso" },
            { value: "all", label: "Tutti" },
          ]}
        />
        <Select aria-label="Filtra per area" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className="h-8 w-auto text-xs">
          <option value="all">Tutte le aree</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
      </div>

      <Card className="p-1.5">
        {!goals || !tasks ? (
          <Skeleton className="m-2 h-40" />
        ) : roots.length === 0 ? (
          <EmptyState
            icon={<Flag />}
            title={goals.length ? "Nessun obiettivo con questi filtri" : "Nessun obiettivo ancora"}
            description="Parti da una visione o da un obiettivo concreto. Definisci un risultato misurabile: il progresso verrà solo dalle evidenze che registri."
            action={
              <Button size="sm" variant="primary" onClick={() => setForm({ open: true })}>
                <Plus /> Crea un obiettivo
              </Button>
            }
          />
        ) : (
          roots.sort(order).map((g) => renderNode(g, 0))
        )}
      </Card>

      <GoalFormDialog state={form} onClose={() => setForm((f) => ({ ...f, open: false }))} goals={goals ?? []} />
      {current ? (
        <GoalDetail
          goal={current}
          goals={goals ?? []}
          onClose={() => setDetail(null)}
          onEdit={() => setForm({ open: true, goal: current })}
          onAddChild={() => {
            const lvl = childLevel(current.level);
            if (lvl) setForm({ open: true, defaults: { parentId: current.id, level: lvl, domain: current.domain } });
          }}
          onOpenGoal={setDetail}
        />
      ) : null}
    </div>
  );
}

function GoalRow({ goal: g, depth, p, kids, open, onToggle, onOpen }: { goal: Goal; depth: number; p: GoalProgress; kids: number; open: boolean; onToggle: () => void; onOpen: () => void }) {
  const { domain, today } = useApp();
  const d = domain(g.domain);
  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-white/[0.03]" style={{ paddingLeft: 8 + depth * 22 }}>
      <button
        onClick={onToggle}
        aria-label={open ? "Comprimi" : "Espandi"}
        aria-expanded={open}
        className={cn("grid size-5 place-items-center rounded text-faint hover:text-fg", !kids && "invisible")}
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </button>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <DomainDot color={d?.color} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("truncate text-[13px]", g.status === "achieved" ? "text-subtle" : "text-fg", depth === 0 && "font-medium")}>{g.title}</span>
            <Badge>{LEVEL_IT[g.level]}</Badge>
            {g.status !== "active" ? <Badge tone={g.status === "achieved" ? "ok" : "neutral"}>{STATUS_LABEL[g.status]}</Badge> : null}
            {p.pace ? <Badge tone={PACE[p.pace].tone}>{PACE[p.pace].label}</Badge> : null}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-subtle">
            {[
              g.outcome,
              g.targetDate ? `entro ${relativeDay(g.targetDate, today)}` : null,
              p.tasksTotal ? `attività ${p.tasksDone}/${p.tasksTotal}` : null,
              kids ? `${kids} sotto-obiettiv${kids === 1 ? "o" : "i"}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="hidden w-36 shrink-0 sm:block">
          {p.progress == null ? (
            <span className="text-[11px] text-faint">Nessuna evidenza</span>
          ) : (
            <span className="flex items-center gap-2">
              <ProgressBar value={p.progress} color={d?.color} label="Progresso" />
              <span className="w-9 text-right text-[11px] text-muted tabular">{pct(p.progress)}</span>
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

/* ───────── Form ───────── */

type Draft = {
  title: string;
  description: string;
  domain: string;
  level: GoalLevel;
  parentId: string;
  startDate: string;
  targetDate: string;
  outcome: string;
  kind: Goal["kind"];
  unit: string;
  baseline: string;
  target: string;
  status: Goal["status"];
};

function GoalFormDialog({ state, onClose, goals }: { state: { open: boolean; goal?: Goal; defaults?: Partial<Goal> }; onClose: () => void; goals: Goal[] }) {
  const { domains, today } = useApp();
  const toast = useToast();
  const [d, setD] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.open) return;
    const g = { ...state.defaults, ...state.goal };
    setD({
      title: g.title ?? "",
      description: g.description ?? "",
      domain: g.domain ?? domains[0]?.id ?? "personal",
      level: g.level ?? "quarterly",
      parentId: g.parentId ?? "",
      startDate: g.startDate ?? today,
      targetDate: g.targetDate ?? "",
      outcome: g.outcome ?? "",
      kind: g.kind ?? "quantitative",
      unit: g.unit ?? "",
      baseline: String(g.baseline ?? 0),
      target: g.target != null ? String(g.target) : "",
      status: g.status ?? "active",
    });
    setErrors({});
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.goal, state.defaults]);

  if (!d) return null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const levelIdx = GOAL_LEVELS.findIndex((l) => l.id === d.level);
  const parents = goals.filter((g) => g.id !== state.goal?.id && GOAL_LEVELS.findIndex((l) => l.id === g.level) < levelIdx);

  async function submit() {
    if (!d) return;
    const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
    const local: Record<string, string> = {};
    if (d.kind === "quantitative") {
      if (!Number.isFinite(num(d.baseline))) local.baseline = "Inserisci un numero";
      if (!Number.isFinite(num(d.target))) local.target = "Inserisci un numero";
    }
    if (Object.keys(local).length) return setErrors(local);
    const payload = {
      title: d.title,
      description: d.description,
      domain: d.domain,
      level: d.level,
      parentId: d.parentId || null,
      startDate: d.startDate,
      targetDate: d.targetDate || null,
      outcome: d.outcome,
      kind: d.kind,
      unit: d.unit,
      baseline: d.kind === "quantitative" ? num(d.baseline) : 0,
      target: d.kind === "quantitative" ? num(d.target) : 1,
      status: d.status,
    };
    try {
      if (state.goal) await updateGoal(state.goal.id, payload);
      else await createGoal(payload);
      toast.success(state.goal ? "Obiettivo aggiornato" : "Obiettivo creato");
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(itErrors(e.fieldErrors));
      else setFormError(errorMessage(e));
    }
  }

  return (
    <Modal
      open={state.open}
      onOpenChange={(o) => !o && onClose()}
      title={state.goal ? "Modifica obiettivo" : "Nuovo obiettivo"}
      description="Un buon obiettivo ha un risultato verificabile e una scadenza."
      onSubmit={submit}
      footer={
        <>
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
        <Field label="Titolo" error={errors.title}>
          {(p) => <Input {...p} autoFocus value={d.title} maxLength={140} onChange={(e) => set("title", e.target.value)} placeholder="es. Migliorare in matematica" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Livello">
            {(p) => (
              <Select {...p} value={d.level} onChange={(e) => setD({ ...d, level: e.target.value as GoalLevel, parentId: "" })}>
                {GOAL_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {LEVEL_IT[l.id]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Area di vita">
            {(p) => (
              <Select {...p} value={d.domain} onChange={(e) => set("domain", e.target.value)}>
                {domains.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Fa parte di" error={errors.parentId} hint={parents.length ? undefined : "Nessun obiettivo di livello superiore disponibile"}>
          {(p) => (
            <Select {...p} value={d.parentId} onChange={(e) => set("parentId", e.target.value)} disabled={!parents.length}>
              <option value="">— Nessuno (obiettivo principale)</option>
              {parents.map((g) => (
                <option key={g.id} value={g.id}>
                  {LEVEL_IT[g.level]}: {g.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Risultato misurabile" error={errors.outcome} hint="Cosa dimostrerà che l'hai raggiunto?">
          {(p) => <Input {...p} value={d.outcome} maxLength={300} onChange={(e) => set("outcome", e.target.value)} placeholder="es. Almeno 80% alla verifica di dicembre" />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Come si misura il progresso</span>
          <Segmented
            label="Tipo di obiettivo"
            value={d.kind}
            onChange={(v) => set("kind", v)}
            className="self-start"
            options={[
              { value: "quantitative", label: "Con un numero" },
              { value: "qualitative", label: "Con dei traguardi" },
            ]}
          />
        </div>
        {d.kind === "quantitative" ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Valore di partenza" error={errors.baseline}>
              {(p) => <Input {...p} type="number" step="any" value={d.baseline} onChange={(e) => set("baseline", e.target.value)} />}
            </Field>
            <Field label="Obiettivo" error={errors.target}>
              {(p) => <Input {...p} type="number" step="any" value={d.target} onChange={(e) => set("target", e.target.value)} />}
            </Field>
            <Field label="Unità">
              {(p) => <Input {...p} value={d.unit} maxLength={24} onChange={(e) => set("unit", e.target.value)} placeholder="%, kg, €, pagine" />}
            </Field>
          </div>
        ) : (
          <p className="-mt-2 text-xs text-subtle">Aggiungerai i traguardi dalla scheda dell'obiettivo. Il progresso = traguardi completati ÷ totali.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inizio" error={errors.startDate}>
            {(p) => <Input {...p} type="date" value={d.startDate} onChange={(e) => set("startDate", e.target.value)} />}
          </Field>
          <Field label="Scadenza" error={errors.targetDate}>
            {(p) => <Input {...p} type="date" value={d.targetDate} onChange={(e) => set("targetDate", e.target.value)} />}
          </Field>
        </div>
        {state.goal ? (
          <Field label="Stato">
            {(p) => (
              <Select {...p} value={d.status} onChange={(e) => set("status", e.target.value as Goal["status"])}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="Descrizione">
          {(p) => <Textarea {...p} rows={2} value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="Perché conta per te?" />}
        </Field>
      </div>
    </Modal>
  );
}

export const LEVEL_IT: Record<GoalLevel, string> = {
  vision: "Visione di vita",
  annual: "Obiettivo annuale",
  quarterly: "Obiettivo trimestrale",
  monthly: "Traguardo mensile",
  weekly: "Target settimanale",
};

function itErrors(e: Record<string, string>) {
  const map: Record<string, string> = {
    "Give the goal a title": "Dai un titolo all'obiettivo",
    "Target must differ from the starting value": "L'obiettivo deve essere diverso dal valore di partenza",
    "Target date can't be before the start": "La scadenza non può precedere l'inizio",
    "A goal can't be its own parent": "Un obiettivo non può contenere se stesso",
    "That would create a loop in the hierarchy": "Questo creerebbe un ciclo nella gerarchia",
  };
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, map[v] ?? v]));
}

/* ───────── Detail ───────── */

function GoalDetail({ goal: g, goals, onClose, onEdit, onAddChild, onOpenGoal }: { goal: Goal; goals: Goal[]; onClose: () => void; onEdit: () => void; onAddChild: () => void; onOpenGoal: (id: string) => void }) {
  const { today, domain, openTask } = useApp();
  const tasks = useTasks() ?? [];
  const toast = useToast();
  const p = goalProgress(g, tasks, today);
  const d = domain(g.domain);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [milestone, setMilestone] = useState("");
  const [confirm, setConfirm] = useState(false);
  const kids = goals.filter((k) => k.parentId === g.id);
  const parent = goals.find((x) => x.id === g.parentId);
  const linked = tasks.filter((t) => t.goalId === g.id);
  const wrap = (pr: Promise<unknown>) => pr.catch((e) => toast.error(errorMessage(e)));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={g.title}
      description={[LEVEL_IT[g.level], d?.label, g.targetDate ? `scadenza ${formatDayMonth(g.targetDate)}` : null, STATUS_LABEL[g.status]].filter(Boolean).join(" · ")}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={() => setConfirm(true)}>
            <Trash2 /> Elimina
          </Button>
          {g.status === "active" && p.progress === 1 ? (
            <Button variant="secondary" onClick={() => wrap(updateGoal(g.id, { status: "achieved" }).then(() => toast.success("Obiettivo raggiunto. Ben fatto.")))}>
              <Check /> Segna come raggiunto
            </Button>
          ) : null}
          <Button variant="primary" onClick={onEdit}>
            <Pencil /> Modifica
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {parent ? (
          <button onClick={() => onOpenGoal(parent.id)} className="self-start text-xs text-subtle hover:text-fg">
            ↑ {LEVEL_IT[parent.level]}: {parent.title}
          </button>
        ) : null}
        {g.outcome ? (
          <div>
            <div className="eyebrow mb-1">Risultato misurabile</div>
            <p className="text-[13px] text-fg">{g.outcome}</p>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="eyebrow">Progresso (solo da evidenze)</span>
            <span className="text-[13px] text-fg tabular">{p.progress == null ? "—" : pct(p.progress)}</span>
          </div>
          <ProgressBar value={p.progress ?? 0} color={d?.color} label="Progresso" />
          {p.elapsed != null ? (
            <p className="mt-1.5 text-[11px] text-subtle">
              Tempo trascorso: {pct(p.elapsed)}
              {p.pace ? ` · ${PACE[p.pace].label.toLowerCase()} rispetto al tempo` : ""}
            </p>
          ) : null}
        </div>

        {g.kind === "quantitative" ? (
          <div>
            <div className="eyebrow mb-2">
              Misure registrate · da {g.baseline} a {g.target} {g.unit}
            </div>
            <form
              className="mb-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Number(value);
                if (value.trim() === "" || !Number.isFinite(v)) return toast.error("Inserisci un valore numerico");
                wrap(addCheckin(g.id, { date, value: v, note: note.trim().slice(0, 300) }).then(() => (setValue(""), setNote(""))));
              }}
            >
              <Input aria-label="Data" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-8 w-auto" />
              <Input aria-label="Valore" type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Valore ${g.unit}`} className="h-8 w-28" />
              <Input aria-label="Nota" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fonte / nota (es. verifica del 12/11)" className="h-8 min-w-40 flex-1" />
              <Button size="sm" type="submit" variant="secondary">
                <Plus /> Registra
              </Button>
            </form>
            {g.checkins.length === 0 ? (
              <p className="text-xs text-subtle">Nessuna misura ancora. Registra un risultato reale (voto, tempo, cifra) per vedere il progresso.</p>
            ) : (
              <ul className="flex flex-col">
                {[...g.checkins].map((c, i) => ({ c, i })).reverse().map(({ c, i }) => (
                  <li key={i} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-white/[0.03]">
                    <span className="w-16 text-[11px] text-subtle">{relativeDay(c.date, today)}</span>
                    <span className="font-medium text-fg tabular">
                      {c.value} {g.unit}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-subtle">{c.note}</span>
                    <Button size="icon-sm" variant="ghost" aria-label="Rimuovi misura" className="opacity-0 group-hover:opacity-100" onClick={() => wrap(removeCheckin(g.id, i))}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <div className="eyebrow mb-2">Traguardi</div>
            <ul className="mb-2 flex flex-col">
              {g.milestones.map((m) => (
                <li key={m.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="accent-[#d4d4d4]"
                    aria-label={m.title}
                    checked={!!m.doneAt}
                    onChange={() => wrap(updateGoal(g.id, { milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, doneAt: x.doneAt ? null : Date.now() } : x)) }))}
                  />
                  <span className={cn("flex-1 text-[13px]", m.doneAt ? "text-subtle line-through" : "text-fg")}>{m.title}</span>
                  <Button size="icon-sm" variant="ghost" aria-label="Rimuovi traguardo" className="opacity-0 group-hover:opacity-100" onClick={() => wrap(updateGoal(g.id, { milestones: g.milestones.filter((x) => x.id !== m.id) }))}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!milestone.trim()) return;
                wrap(updateGoal(g.id, { milestones: [...g.milestones, { id: uid(), title: milestone.trim().slice(0, 120), doneAt: null }] }).then(() => setMilestone("")));
              }}
            >
              <Input aria-label="Nuovo traguardo" value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder="Nuovo traguardo concreto e verificabile" className="h-8" />
              <Button size="sm" variant="secondary" type="submit">
                <Plus /> Aggiungi
              </Button>
            </form>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="eyebrow">Azioni collegate {linked.length ? `· ${p.tasksDone}/${p.tasksTotal} completate` : ""}</span>
            <Button size="sm" variant="ghost" onClick={() => openTask(undefined, { goalId: g.id, domain: g.domain })}>
              <Plus /> Nuova attività
            </Button>
          </div>
          <p className="mb-1 text-[11px] text-faint">Le attività completate mostrano l'impegno, ma non sono conteggiate come progresso: conta il risultato.</p>
          {linked.length ? linked.map((t) => <TaskRow key={t.id} task={t} compact />) : <p className="text-xs text-subtle">Nessuna attività collegata.</p>}
        </div>

        {childLevel(g.level) ? (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="eyebrow">Sotto-obiettivi</span>
              <Button size="sm" variant="ghost" onClick={onAddChild}>
                <Plus /> {LEVEL_IT[childLevel(g.level)!]}
              </Button>
            </div>
            {kids.length ? (
              <ul>
                {kids.map((k) => {
                  const kp = goalProgress(k, tasks, today);
                  return (
                    <li key={k.id}>
                      <button onClick={() => onOpenGoal(k.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.03]">
                        <span className="flex-1 truncate text-[13px] text-fg">{k.title}</span>
                        <span className="text-[11px] text-subtle tabular">{kp.progress == null ? "nessuna evidenza" : pct(kp.progress)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-subtle">Scomponi questo obiettivo in passi più piccoli.</p>
            )}
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Eliminare questo obiettivo?"
        description="I sotto-obiettivi salgono di un livello e le attività collegate restano, ma scollegate. L'operazione non si può annullare."
        confirmLabel="Elimina obiettivo"
        danger
        onConfirm={async () => {
          await deleteGoal(g.id);
          toast.info("Obiettivo eliminato");
          onClose();
        }}
      />
    </Modal>
  );
}
