import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";

/** Shared chart styling: thin marks, recessive axes, hover tooltip. Every chart reads real stored data. */

export function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; format: (v: number, key: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-elevated/95 px-2.5 py-2 text-[11px] shadow-xl backdrop-blur">
      <div className="mb-1 text-muted">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-fg">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-subtle">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular">{format(p.value, p.dataKey)}</span>
        </div>
      ))}
    </div>
  );
}

type Series = { key: string; name: string; color: string };

export function MiniBarChart({
  data,
  xKey,
  series,
  format,
  height = 140,
  yMax,
  legend,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: Series[];
  format: (v: number, key: string) => string;
  height?: number;
  yMax?: number;
  legend?: ReactNode;
}) {
  return (
    <div>
      {series.length > 1 ? (
        <div className="mb-2 flex gap-3 text-[11px] text-subtle">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
          {legend}
        </div>
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.05)" />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: "#74747f", fontSize: 10 }} interval={0} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#4e4e57", fontSize: 10 }} width={40} domain={[0, yMax ?? "auto"]} allowDecimals={false} tickFormatter={(v) => format(v, "axis")} />
            <Tooltip cursor={{ fill: "rgb(255 255 255 / 0.04)" }} content={(p) => <ChartTooltip {...(p as object)} format={format} />} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
