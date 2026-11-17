import { Minus, MoreHorizontal, Plus } from "lucide-react";
import type { Excuse, Habit, HabitLog, Mode } from "@/db/schema";
import { excuseHabit, setHabitValue } from "@/db/repo";
import { useApp } from "@/hooks/app";
import { useToast } from "@/components/ui/toast";
import { Badge, CheckButton, DomainDot } from "@/components/ui/misc";
import { Menu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { creditOf, dayState, describeFrequency, weekProgress, type LogMap } from "@/lib/habits";
import { cn, errorMessage } from "@/lib/utils";

const EXCUSES: { value: Excuse; label: string }[] = [
  { value: "rest", label: "Giorno di riposo pianificato" },
  { value: "illness", label: "Malato" },
  { value: "injury", label: "Infortunato" },
  { value: "travel", label: "In viaggio" },
  { value: "other", label: "Altro motivo legittimo" },
];

export function HabitCheckRow({ habit: h, log, logs, mode, date, compact }: { habit: Habit; log?: HabitLog; logs: LogMap; mode: Mode; date: string; compact?: boolean }) {
  const { domain, today } = useApp();
  const toast = useToast();
  const d = domain(h.domain);
  const credit = creditOf(h, log);
  const state = dayState(h, date, log, mode, today);
  const value = log && !log.excused ? log.value : 0;
  const wrap = (p: Promise<unknown>) => p.catch((e) => toast.error(errorMessage(e)));
  const week = h.frequency.type === "weekly" ? weekProgress(h, logs, date) : null;

  const toggle = () => wrap(setHabitValue(h, date, credit >= 1 ? 0 : h.target));

  return (
    <div className={cn("group flex items-center gap-3 rounded-lg px-3 transition-colors hover:bg-white/[0.03]", compact ? "py-1.5" : "py-2.5", state === "excused" && "opacity-60")}>
      <CheckButton checked={credit >= 1} partial={credit} onChange={toggle} label={credit >= 1 ? `Undo ${h.name}` : `Complete ${h.name}`} color={d?.color} />
      <div className="min-w-16 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-[13px]", credit >= 1 ? "text-muted" : "text-fg")}>{h.name}</span>
          {state === "not-required" ? <Badge title="Non prevista in Recupero: farla è un bonus">Sospesa in Recupero</Badge> : null}
          {h.tier === "optional" ? <Badge>Bonus</Badge> : null}
          {state === "excused" ? <Badge tone="ok">Excused · {EXCUSES.find((e) => e.value === log?.excused)?.label}</Badge> : null}
        </div>
        {!compact ? (
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-subtle">
            <DomainDot color={d?.color} className="size-1.5" />
            <span>{describeFrequency(h)}</span>
            {week ? (
              <span className="tabular">
                · {Math.floor(week.done)}/{week.target} questa settimana
              </span>
            ) : null}
            {h.estimateMin ? <span>· {h.estimateMin}m</span> : null}
          </div>
        ) : week ? (
          <div className="text-[11px] text-subtle tabular">
            {Math.floor(week.done)}/{week.target} questa settimana
          </div>
        ) : null}
      </div>

      {h.target > 1 && state !== "excused" ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" className={compact ? "hidden sm:inline-flex" : ""} aria-label={`Decrease ${h.name}`} disabled={value <= 0} onClick={() => wrap(setHabitValue(h, date, value - 1))}>
            <Minus />
          </Button>
          <span className={cn("text-center font-mono text-xs text-muted tabular", compact ? "min-w-8" : "min-w-12")} aria-live="polite">
            {value}/{h.target}
            {h.unit && !compact ? <span className="block text-[10px] text-faint">{h.unit}</span> : null}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label={`Increase ${h.name}`} disabled={value >= 1000} onClick={() => wrap(setHabitValue(h, date, value + 1))}>
            <Plus />
          </Button>
        </div>
      ) : null}

      <Menu
        label={`Altro per ${h.name}`}
        trigger={(p) => (
          <Button variant="ghost" size="icon-sm" className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:aria-expanded:opacity-100" {...p}>
            <MoreHorizontal />
          </Button>
        )}
        items={[
          { custom: <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-wider text-faint uppercase">Giustifica questo giorno</div> },
          ...EXCUSES.map((e) => ({
            label: e.label,
            onSelect: () =>
              wrap(
                excuseHabit(h.id, date, e.value).then(() => toast.info("Giustificato: questo giorno non conterà contro di te.")),
              ),
          })),
          ...(log?.excused ? ["separator" as const, { label: "Rimuovi giustificazione", onSelect: () => wrap(excuseHabit(h.id, date, null)) }] : []),
        ]}
      />
    </div>
  );
}
