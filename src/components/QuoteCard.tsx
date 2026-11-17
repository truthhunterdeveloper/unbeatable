import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { useApp } from "@/hooks/app";
import { AREA_LABEL, AYAT, QUOTES, dailyIndex, type QuoteArea } from "@/lib/quotes";
import { cn } from "@/lib/utils";

/**
 * Quote of the day for an area, with animated next/previous.
 * `rotate` cycles automatically (used on the dashboard across all areas).
 */
export function QuoteCard({ areas, className, rotate = false, variant = "card" }: { areas: QuoteArea[]; className?: string; rotate?: boolean; variant?: "card" | "inline" }) {
  const { today, domain } = useApp();
  const [areaIdx, setAreaIdx] = useState(0);
  const area = areas[areaIdx % areas.length];
  const [offset, setOffset] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const list = QUOTES[area];
  const idx = (((dailyIndex(area, today) + offset) % list.length) + list.length) % list.length;

  useEffect(() => {
    if (!rotate) return;
    const t = setInterval(() => {
      setDir(1);
      setAreaIdx((i) => i + 1);
    }, 12000);
    return () => clearInterval(t);
  }, [rotate]);

  const step = (d: 1 | -1) => {
    setDir(d);
    setOffset((o) => o + d);
  };
  const color = area === "discipline" ? "var(--color-accent)" : (domain(area)?.color ?? "var(--color-accent)");

  if (variant === "inline") {
    return (
      <p key={`${area}-${idx}`} className={cn("quote-in text-[13px] leading-relaxed text-muted italic", className)}>
        “{list[idx]}”
      </p>
    );
  }

  return (
    <section className={cn("card quote-glow relative overflow-hidden px-5 py-4", className)} style={{ ["--q" as string]: color }} aria-label="Motivational quote">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
          <Quote className="size-3.5" style={{ color }} /> {AREA_LABEL[area]} · {idx + 1}/{list.length}
        </span>
        <span className="flex gap-1">
          <button type="button" aria-label="Previous quote" onClick={() => step(-1)} className="grid size-7 place-items-center rounded-md text-subtle transition-colors hover:bg-white/5 hover:text-fg">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" aria-label="Next quote" onClick={() => step(1)} className="grid size-7 place-items-center rounded-md text-subtle transition-colors hover:bg-white/5 hover:text-fg">
            <ChevronRight className="size-4" />
          </button>
        </span>
      </div>
      <p key={`${area}-${idx}`} className={cn("mt-2 text-[17px] leading-snug font-medium tracking-[-0.01em] text-fg", dir === 1 ? "quote-in" : "quote-in-back")} lang="en">
        “{list[idx]}”
      </p>
    </section>
  );
}

/** Verse of the day: Arabic text with English translation and reference. */
export function AyahCard({ className }: { className?: string }) {
  const { today } = useApp();
  const [offset, setOffset] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const base = [...today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const idx = (((base + offset) % AYAT.length) + AYAT.length) % AYAT.length;
  const a = AYAT[idx];
  const step = (d: 1 | -1) => {
    setDir(d);
    setOffset((o) => o + d);
  };
  return (
    <section className={cn("card px-5 py-4", className)} aria-label="Ayah of the day">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
          <BookOpen className="size-3.5" /> {a.surah} · {a.ref}
        </span>
        <span className="flex gap-1">
          <button type="button" aria-label="Previous ayah" onClick={() => step(-1)} className="grid size-7 place-items-center rounded-md text-subtle hover:bg-white/5 hover:text-fg">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" aria-label="Next ayah" onClick={() => step(1)} className="grid size-7 place-items-center rounded-md text-subtle hover:bg-white/5 hover:text-fg">
            <ChevronRight className="size-4" />
          </button>
        </span>
      </div>
      <div key={idx} className={dir === 1 ? "quote-in" : "quote-in-back"}>
        <p lang="ar" dir="rtl" className="mt-3 text-right text-[22px] leading-[1.9] text-fg" style={{ fontFamily: '"Geeza Pro", "Noto Naskh Arabic", "Traditional Arabic", "Segoe UI", serif' }}>
          {a.ar}
        </p>
        <p className="mt-1 text-[12px] text-subtle italic">{a.tr}</p>
        <p className="mt-2 text-[14px] leading-relaxed text-fg">«{a.it}»</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{a.lesson}</p>
      </div>
    </section>
  );
}
