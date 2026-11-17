import { useEffect, useMemo, useRef, useState } from "react";
import { ListChecks, Plus, Search, X } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useTasks } from "@/hooks/data";
import type { Task } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Card, EmptyState, Kbd, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { TaskRow, useTaskActions } from "./TaskRow";
import { scoreTask } from "@/lib/mission";
import { addDays, daysBetween, formatDuration } from "@/lib/date";
import { cn, isTypingTarget } from "@/lib/utils";

type View = "open" | "today" | "upcoming" | "done" | "all";
type Sort = "smart" | "due" | "priority" | "created" | "estimate";
type ClassFilter = "all" | "important" | "urgent" | "optional";

const STORE_KEY = "dos:tasks:prefs";

function loadPrefs(): { view: View; sort: Sort } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    return { view: v.view ?? "open", sort: v.sort ?? "smart" };
  } catch {
    return { view: "open", sort: "smart" };
  }
}

export function TasksPage() {
  const { today, domains, openTask, domain } = useApp();
  const tasks = useTasks();
  const actions = useTaskActions();
  const [view, setView] = useState<View>(() => loadPrefs().view);
  const [sort, setSort] = useState<Sort>(() => loadPrefs().sort);
  const [q, setQ] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ view, sort }));
    } catch {
      /* ignore */
    }
  }, [view, sort]);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const term = q.trim().toLowerCase();
    const weekAhead = addDays(today, 7);
    return tasks
      .filter((t) => {
        switch (view) {
          case "open":
            return t.status !== "done";
          case "today":
            return t.status !== "done" && (t.scheduledDate === today || t.missionDate === today || (t.dueDate != null && t.dueDate <= today));
          case "upcoming":
            return t.status !== "done" && ((t.dueDate != null && t.dueDate > today && t.dueDate <= weekAhead) || (t.scheduledDate != null && t.scheduledDate > today && t.scheduledDate <= weekAhead));
          case "done":
            return t.status === "done";
          case "all":
            return true;
        }
      })
      .filter((t) => domainFilter === "all" || t.domain === domainFilter)
      .filter((t) => classFilter === "all" || t[classFilter])
      .filter((t) => !term || `${t.title} ${t.description} ${t.notes}`.toLowerCase().includes(term))
      .sort((a, b) => compare(a, b, view === "done" ? "done" : sort, today));
  }, [tasks, view, sort, q, domainFilter, classFilter, today]);

  const groups = useMemo(() => {
    if (view === "done" || (sort !== "smart" && sort !== "due")) return [{ key: "all", label: null as string | null, items: filtered }];
    const buckets: Record<string, Task[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    for (const t of filtered) {
      if (t.status === "done") buckets.later.push(t);
      else if (!t.dueDate) buckets.none.push(t);
      else if (t.dueDate < today) buckets.overdue.push(t);
      else if (t.dueDate === today) buckets.today.push(t);
      else if (daysBetween(today, t.dueDate) <= 7) buckets.week.push(t);
      else buckets.later.push(t);
    }
    return [
      { key: "overdue", label: "In ritardo", items: buckets.overdue },
      { key: "today", label: "Scade oggi", items: buckets.today },
      { key: "week", label: "Prossimi 7 giorni", items: buckets.week },
      { key: "later", label: "Più avanti", items: buckets.later },
      { key: "none", label: "Senza scadenza", items: buckets.none },
    ].filter((g) => g.items.length);
  }, [filtered, view, sort, today]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Keyboard: / search, j/k move, x complete, e/Enter edit, m mission.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape" && e.target === searchRef.current) searchRef.current?.blur();
        return;
      }
      const idx = flat.findIndex((t) => t.id === selected);
      const cur = idx >= 0 ? flat[idx] : undefined;
      const move = (n: number) => {
        if (!flat.length) return;
        const next = flat[Math.max(0, Math.min(flat.length - 1, idx < 0 ? 0 : idx + n))];
        setSelected(next.id);
        document.querySelector(`[data-task-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
      };
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (cur && e.key === "x") {
        e.preventDefault();
        actions.toggle(cur);
      } else if (cur && (e.key === "e" || e.key === "Enter")) {
        e.preventDefault();
        openTask(cur);
      } else if (cur && e.key === "m") {
        e.preventDefault();
        if (cur.status !== "done") actions.toggleMission(cur);
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, selected, actions, openTask]);

  const open = (tasks ?? []).filter((t) => t.status !== "done");
  const overdueCount = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const estimate = open.reduce((s, t) => s + Math.max(0, (t.estimateMin ?? 0) - t.actualMin), 0);
  const filtersActive = q || domainFilter !== "all" || classFilter !== "all";

  return (
    <div>
      <PageHeader
        title="Attività"
        description={tasks ? `${open.length} attività apert${open.length === 1 ? "a" : "e"}${overdueCount ? ` · ${overdueCount} in ritardo` : ""}${estimate ? ` · ${formatDuration(estimate)} stimati rimanenti` : ""}` : "Loading…"}
        actions={
          <Button variant="primary" onClick={() => openTask(undefined, view === "today" ? { scheduledDate: today } : undefined)}>
            <Plus /> Nuova attività <Kbd className="ml-1 border-black/15 bg-black/5 text-black/50">N</Kbd>
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          label="Vista"
          value={view}
          onChange={(v) => {
            setView(v);
            setSelected(null);
          }}
          className="self-start overflow-x-auto"
          options={[
            { value: "open", label: "Aperte" },
            { value: "today", label: "Oggi" },
            { value: "upcoming", label: "In arrivo" },
            { value: "done", label: "Fatto" },
            { value: "all", label: "Tutte" },
          ]}
        />
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative min-w-40 flex-1 lg:max-w-60">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
            <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca" aria-label="Cerca attività" className="h-8 pl-8" />
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
          </div>
          <Select aria-label="Filtra per area" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className="h-8 w-auto text-xs">
            <option value="all">Tutte le aree</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filtra per classificazione" value={classFilter} onChange={(e) => setClassFilter(e.target.value as ClassFilter)} className="h-8 w-auto text-xs">
            <option value="all">Ogni classe</option>
            <option value="important">Importante</option>
            <option value="urgent">Urgente</option>
            <option value="optional">Facoltativo</option>
          </Select>
          <Select aria-label="Ordina" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 w-auto text-xs" disabled={view === "done"}>
            <option value="smart">Ordina: impatto</option>
            <option value="due">Ordina: scadenza</option>
            <option value="priority">Ordina: priorità</option>
            <option value="estimate">Ordina: stima</option>
            <option value="created">Ordina: più recenti</option>
          </Select>
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setDomainFilter("all");
                setClassFilter("all");
              }}
            >
              <X /> Azzera
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="p-1.5" role="grid" aria-label="Attività">
        {!tasks ? (
          <div className="flex flex-col gap-2 p-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : flat.length === 0 ? (
          <EmptyState
            icon={<ListChecks />}
            title={filtersActive ? "Nessuna attività con questi filtri" : view === "done" ? "Ancora niente di completato" : tasks.length === 0 ? "Nessuna attività ancora" : "Niente qui"}
            description={
              filtersActive
                ? "Prova ad azzerare ricerca o filtri."
                : tasks.length === 0
                  ? "Annota cosa c'è da fare. Classificalo con onestà — importante, urgente o facoltativo — e il Centro di comando mostrerà ciò che conta."
                  : view === "today"
                    ? "Niente di pianificato o in scadenza oggi. Pianifica le attività dal loro menu."
                    : undefined
            }
            action={
              !filtersActive && view !== "done" ? (
                <Button variant="primary" size="sm" onClick={() => openTask()}>
                  <Plus /> Nuova attività
                </Button>
              ) : undefined
            }
          />
        ) : (
          groups.map((g) => (
            <div key={g.key} className="mb-1 last:mb-0">
              {g.label ? (
                <div className={cn("flex items-center gap-2 px-3 pt-2.5 pb-1 text-[11px] font-medium", g.key === "overdue" ? "text-danger" : "text-subtle")}>
                  {g.label}
                  <span className="text-faint tabular">{g.items.length}</span>
                </div>
              ) : null}
              {g.items.map((t) => (
                <TaskRow key={t.id} task={t} selected={selected === t.id} onSelect={() => setSelected(t.id)} />
              ))}
            </div>
          ))
        )}
      </Card>
      {flat.length ? (
        <p className="mt-3 hidden items-center gap-3 text-[11px] text-faint md:flex">
          <span>
            <Kbd>J</Kbd> <Kbd>K</Kbd> sposta
          </span>
          <span>
            <Kbd>X</Kbd> completa
          </span>
          <span>
            <Kbd>E</Kbd> modifica
          </span>
          <span>
            <Kbd>M</Kbd> missione
          </span>
          <span className="ml-auto">{domainFilter !== "all" ? domain(domainFilter)?.label : null}</span>
        </p>
      ) : null}
    </div>
  );
}

function compare(a: Task, b: Task, sort: Sort | "done", today: string): number {
  switch (sort) {
    case "done":
      return (b.completedAt ?? 0) - (a.completedAt ?? 0);
    case "smart": {
      const s = scoreTask(b, today).score - scoreTask(a, today).score;
      return s || dueCompare(a, b) || a.createdAt - b.createdAt;
    }
    case "due":
      return dueCompare(a, b) || a.priority - b.priority;
    case "priority":
      return a.priority - b.priority || Number(b.important) - Number(a.important) || dueCompare(a, b);
    case "estimate":
      return (a.estimateMin ?? Infinity) - (b.estimateMin ?? Infinity);
    case "created":
      return b.createdAt - a.createdAt;
  }
}

function dueCompare(a: Task, b: Task) {
  if (a.dueDate === b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}
