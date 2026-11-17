import { Activity, BatteryCharging, Zap, type LucideIcon } from "lucide-react";
import type { Mode } from "@/db/schema";
import { setMode } from "@/db/repo";
import { useApp } from "@/hooks/app";
import { useToast } from "@/components/ui/toast";
import { MODE_COPY } from "@/lib/mission";
import { cn, errorMessage } from "@/lib/utils";

export const MODE_ICON: Record<Mode, LucideIcon> = { standard: Activity, intense: Zap, recovery: BatteryCharging };
export const MODE_COLOR: Record<Mode, string> = { standard: "text-fg", intense: "text-warn", recovery: "text-ok" };

export function useSwitchMode() {
  const { today, settings } = useApp();
  const toast = useToast();
  return async (m: Mode) => {
    if (m === settings.mode) return;
    try {
      await setMode(m, today);
      toast.success(
        m === "recovery"
          ? "Modalità Recupero attiva. Oggi è previsto solo l'essenziale."
          : m === "intense"
            ? "Modalità Alta intensità attiva. Sonno e recupero restano protetti."
            : "Modalità Standard attiva.",
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
}

export function ModeSwitcher({ compact = false }: { compact?: boolean }) {
  const { settings } = useApp();
  const switchMode = useSwitchMode();
  const modes: Mode[] = ["standard", "intense", "recovery"];
  return (
    <div role="radiogroup" aria-label="Modalità operativa" className={cn("flex gap-1", compact ? "" : "rounded-xl border border-line bg-white/[0.015] p-1")}>
      {modes.map((m) => {
        const Icon = MODE_ICON[m];
        const active = settings.mode === m;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={active}
            title={`${MODE_COPY[m].label} — ${MODE_COPY[m].description}`}
            onClick={() => switchMode(m)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-medium transition-colors",
              active ? "bg-white/[0.08] text-fg" : "text-subtle hover:bg-white/[0.04] hover:text-muted",
            )}
          >
            <Icon className={cn("size-3.5", active ? MODE_COLOR[m] : "")} />
            {MODE_COPY[m].short}
          </button>
        );
      })}
    </div>
  );
}
