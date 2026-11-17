import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = { label: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean } | "separator" | { custom: ReactNode };

/** Small accessible dropdown menu (button + list), closes on outside click / Escape. */
export function Menu({ trigger, items, align = "right", label }: { trigger: (p: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu"; "aria-label": string }) => ReactNode; items: MenuItem[]; align?: "left" | "right"; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    // Focus the first item for keyboard users.
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu", "aria-label": label })}
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            "absolute top-full z-40 mt-1 min-w-44 animate-scale-in rounded-xl border border-line-strong bg-elevated p-1 shadow-2xl shadow-black/50",
            align === "right" ? "right-0" : "left-0",
          )}
          onKeyDown={(e) => {
            const els = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
            const i = els.indexOf(document.activeElement as HTMLElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              els[(i + 1) % els.length]?.focus();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              els[(i - 1 + els.length) % els.length]?.focus();
            }
          }}
        >
          {items.map((it, i) =>
            it === "separator" ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : "custom" in it ? (
              <div key={i}>{it.custom}</div>
            ) : (
              <button
                key={i}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus:outline-none [&_svg]:size-3.5",
                  it.danger ? "text-danger hover:bg-danger/10 focus:bg-danger/10" : "text-muted hover:bg-white/[0.06] hover:text-fg focus:bg-white/[0.06] focus:text-fg",
                )}
              >
                {it.icon ? <span className="text-subtle">{it.icon}</span> : null}
                {it.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
