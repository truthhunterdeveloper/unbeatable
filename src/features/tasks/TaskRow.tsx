import { useNavigate } from "react-router";
import { CalendarClock, MoreHorizontal, Pencil, Play, Target, Trash2 } from "lucide-react";
import type { Task } from "@/db/schema";
import { deleteTask, pinToMission, restoreTask, toggleTaskDone, unpinMission, updateTask } from "@/db/repo";
import { useApp } from "@/hooks/app";
import { useToast } from "@/components/ui/toast";
import { Badge, CheckButton, DomainDot } from "@/components/ui/misc";
import { Menu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { addDays, daysBetween, formatDuration, relativeDay, startOfWeek } from "@/lib/date";
import { cn, errorMessage } from "@/lib/utils";

export function useTaskActions() {
  const { today, settings } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const wrap = (fn: () => Promise<unknown>) => fn().catch((e) => toast.error(errorMessage(e)));
  return {
    toggle: (t: Task) =>
      wrap(async () => {
        const next = await toggleTaskDone(t.id);
        if (next.status === "done") toast.success("Completata", { label: "Annulla", run: () => wrap(() => toggleTaskDone(t.id)) });
      }),
    toggleMission: (t: Task) =>
      wrap(async () => {
        if (t.missionDate === today) await unpinMission(t.id);
        else {
          await pinToMission(t.id, today);
          toast.success("Aggiunta alla Missione di oggi");
        }
      }),
    reschedule: (t: Task, date: string | null) =>
      wrap(async () => {
        await updateTask(t.id, { scheduledDate: date, missionDate: t.missionDate && date !== t.missionDate ? null : t.missionDate });
        toast.success(date ? `Pianificata: ${relativeDay(date, today)}` : "Tolta dalla pianificazione");
      }),
    remove: (t: Task) =>
      wrap(async () => {
        const snap = await deleteTask(t.id);
        if (snap) toast.info("Attività eliminata", { label: "Annulla", run: () => wrap(() => restoreTask(snap)) });
      }),
    focus: (t: Task) => navigate(`/focus?task=${t.id}`),
    nextWeek: () => addDays(startOfWeek(today, settings.weekStart), 7),
  };
}

type RowProps = {
  task: Task;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
  showMission?: boolean;
};

export function TaskRow({ task: t, selected, onSelect, compact, showMission = true }: RowProps) {
  const { domain, today, openTask } = useApp();
  const actions = useTaskActions();
  const d = domain(t.domain);
  const done = t.status === "done";
  const overdue = !done && t.dueDate != null && t.dueDate < today;
  const dueSoon = !done && t.dueDate != null && !overdue && daysBetween(today, t.dueDate) <= 1;
  const inMission = t.missionDate === today;

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={-1}
      data-task-id={t.id}
      onClick={() => (onSelect ? onSelect() : openTask(t))}
      onDoubleClick={() => openTask(t)}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 transition-colors",
        compact ? "py-2" : "py-2.5",
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
        "cursor-default",
      )}
    >
      {selected ? <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" /> : null}
      <CheckButton checked={done} onChange={() => actions.toggle(t)} label={done ? `Riapri ${t.title}` : `Completa ${t.title}`} color={d?.color} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-[13px]", done ? "text-subtle line-through decoration-white/20" : "text-fg")}>{t.title}</span>
          {t.important ? <Badge tone="accent">Importante</Badge> : null}
          {t.urgent ? <Badge tone="warn">Urgente</Badge> : null}
          {t.optional ? <Badge>Facoltativo</Badge> : null}
          {t.status === "in_progress" ? <span className="size-1.5 shrink-0 rounded-full bg-accent" title="In corso" /> : null}
        </div>
        {!compact || t.dueDate || t.estimateMin ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-2.5 text-[11px] text-subtle">
            {!compact ? (
              <span className="flex items-center gap-1.5">
                <DomainDot color={d?.color} className="size-1.5" />
                {d?.label ?? t.domain}
              </span>
            ) : null}
            {t.dueDate ? (
              <span className={cn(overdue ? "text-danger" : dueSoon ? "text-warn" : "")}>
                {overdue ? "In ritardo · " : "Scade "}
                {relativeDay(t.dueDate, today)}
              </span>
            ) : null}
            {t.scheduledDate && t.scheduledDate !== today && !done ? <span>Pianificato {relativeDay(t.scheduledDate, today)}</span> : null}
            {t.estimateMin || t.actualMin ? (
              <span className="tabular">
                {t.actualMin ? `${formatDuration(t.actualMin)} impiegati` : ""}
                {t.actualMin && t.estimateMin ? " / " : ""}
                {t.estimateMin ? `${formatDuration(t.estimateMin)} stimati` : ""}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={cn("flex items-center gap-0.5 transition-opacity", selected ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100")}>
        {!done ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Focus su ${t.title}`} title="Avvia sessione di focus" onClick={(e) => (e.stopPropagation(), actions.focus(t))}>
            <Play />
          </Button>
        ) : null}
        {showMission && !done ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={inMission ? "Togli dalla Missione di oggi" : "Aggiungi alla Missione di oggi"}
            aria-pressed={inMission}
            title={inMission ? "Togli dalla Missione di oggi" : "Aggiungi alla Missione di oggi"}
            className={inMission ? "text-accent hover:text-accent" : ""}
            onClick={(e) => (e.stopPropagation(), actions.toggleMission(t))}
          >
            <Target />
          </Button>
        ) : null}
        <Menu
          label="Azioni attività"
          trigger={(p) => (
            <Button variant="ghost" size="icon-sm" {...p}>
              <MoreHorizontal />
            </Button>
          )}
          items={[
            { label: "Modifica", icon: <Pencil />, onSelect: () => openTask(t) },
            "separator",
            { label: "Pianifica per oggi", icon: <CalendarClock />, onSelect: () => actions.reschedule(t, today) },
            { label: "Pianifica per domani", icon: <CalendarClock />, onSelect: () => actions.reschedule(t, addDays(today, 1)) },
            { label: "Pianifica per la prossima settimana", icon: <CalendarClock />, onSelect: () => actions.reschedule(t, actions.nextWeek()) },
            ...(t.scheduledDate ? [{ label: "Togli dalla pianificazione", icon: <CalendarClock />, onSelect: () => actions.reschedule(t, null) }] : []),
            "separator",
            { label: "Elimina", icon: <Trash2 />, danger: true, onSelect: () => actions.remove(t) },
          ]}
        />
      </div>
      {inMission && showMission && !selected ? (
        <Target className="absolute right-3 hidden size-3 text-accent md:block md:group-focus-within:hidden md:group-hover:hidden" aria-label="Nella Missione di oggi" />
      ) : null}
    </div>
  );
}
