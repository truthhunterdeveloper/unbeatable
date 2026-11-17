import { Check } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tapFeedback } from "@/lib/native";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("card min-w-0", className)} {...p} />;
}

export function CardHeader({ title, icon, action, sub, className }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex items-center justify-between gap-3 px-4 pt-3.5 pb-2", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon ? <span className="text-subtle [&_svg]:size-3.5">{icon}</span> : null}
        <h2 className="eyebrow truncate">{title}</h2>
        {sub ? <span className="truncate text-xs text-faint">{sub}</span> : null}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-white/[0.05] text-muted border-line",
  accent: "bg-accent-soft text-accent border-accent/20",
  ok: "bg-ok/10 text-ok border-ok/20",
  warn: "bg-warn/10 text-warn border-warn/20",
  danger: "bg-danger/10 text-danger border-danger/20",
};

export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}
      {...p}
    />
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line-strong bg-white/[0.04] px-1 font-mono text-[10px] text-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function DomainDot({ color, className }: { color?: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color ?? "#71717a" }} />;
}

export function ProgressBar({ value, color, className, label }: { value: number; color?: string; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${v * 100}%`, background: color ?? "var(--color-accent)" }} />
    </div>
  );
}

export function Ring({ value, size = 44, stroke = 4, color, children, label }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? "var(--color-fg)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </svg>
      {children ? <div className="absolute inset-0 grid place-items-center">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 grid size-10 place-items-center rounded-xl border border-line bg-white/[0.02] text-subtle [&_svg]:size-4.5">{icon}</div> : null}
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-xs text-xs leading-relaxed text-subtle">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/[0.04]", className)} aria-hidden />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg border border-line bg-white/[0.02] p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
              active ? "bg-white/[0.09] text-fg shadow-sm" : "text-subtle hover:text-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Round completion toggle used for tasks and habits. */
export function CheckButton({
  checked,
  onChange,
  label,
  color,
  partial = 0,
  size = "md",
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  color?: string;
  partial?: number;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "size-4" : "size-[18px]";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked ? true : partial > 0 ? "mixed" : false}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        tapFeedback();
        onChange();
      }}
      className={cn(
        "group/check relative grid shrink-0 place-items-center rounded-full border transition-all duration-200",
        dim,
        checked ? "border-transparent" : "border-white/25 hover:border-white/50",
      )}
      style={checked ? { background: color ?? "var(--color-fg)" } : undefined}
    >
      {!checked && partial > 0 ? (
        <span className="absolute inset-[2px] rounded-full opacity-60" style={{ background: `conic-gradient(${color ?? "#ededef"} ${partial * 360}deg, transparent 0)` }} />
      ) : null}
      <Check className={cn("size-3 stroke-[3] text-bg transition-transform", checked ? "scale-100" : "scale-0")} />
    </button>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] text-subtle">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight text-fg tabular">{value}</div>
      {sub ? <div className="text-[11px] text-faint">{sub}</div> : null}
    </div>
  );
}
