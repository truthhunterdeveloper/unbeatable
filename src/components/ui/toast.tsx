import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string; action?: { label: string; run: () => void } };
type ToastApi = {
  success: (m: string, action?: ToastItem["action"]) => void;
  error: (m: string) => void;
  info: (m: string, action?: ToastItem["action"]) => void;
};

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, message: string, action?: ToastItem["action"]) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { id, kind, message, action }]);
      setTimeout(() => dismiss(id), action ? 6000 : kind === "error" ? 6000 : 3200);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, a) => push("success", m, a),
      error: (m) => push("error", m),
      info: (m, a) => push("info", m, a),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertCircle : Info;
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className="pointer-events-auto flex max-w-md animate-rise items-center gap-3 rounded-xl border border-line-strong bg-elevated/95 py-2 pr-2 pl-3 text-[13px] shadow-xl shadow-black/40 backdrop-blur"
            >
              <Icon className={cn("size-4 shrink-0", t.kind === "success" ? "text-ok" : t.kind === "error" ? "text-danger" : "text-accent")} />
              <span className="text-fg">{t.message}</span>
              {t.action ? (
                <button
                  className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
              <button aria-label="Chiudi" className="rounded-md p-1 text-subtle hover:text-fg" onClick={() => dismiss(t.id)}>
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
