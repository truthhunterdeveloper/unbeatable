import * as D from "@radix-ui/react-dialog";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { BedDouble, CalendarPlus, CornerDownLeft, Download, Keyboard, ListPlus, Play, Plus, Search } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useTasks } from "@/hooks/data";
import { useNavItems } from "@/hooks/nav";
import { MODE_ICON, useSwitchMode } from "./ModeSwitcher";
import { MODE_COPY } from "@/lib/mission";
import type { Mode } from "@/db/schema";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Cmd = { id: string; label: string; group: string; icon: ReactNode; hint?: string; keywords?: string; run: () => void };

export function CommandPalette() {
  const { palette, setPalette, openTask, setSleepDialog, setShortcuts, domain } = useApp();
  const navigate = useNavigate();
  const switchMode = useSwitchMode();
  const tasks = useTasks();
  const navItems = useNavItems();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const close = () => {
    setPalette(false);
    setQ("");
    setIdx(0);
  };

  const commands = useMemo<Cmd[]>(() => {
    const base: Cmd[] = [
      { id: "new-task", group: "Azioni", label: "Nuova attività", icon: <Plus />, hint: "N", run: () => openTask() },
      { id: "start-focus", group: "Azioni", label: "Avvia una sessione di focus", icon: <Play />, keywords: "deep work timer pomodoro", run: () => navigate("/focus") },
      { id: "log-sleep", group: "Azioni", label: "Registra il sonno", icon: <BedDouble />, keywords: "recovery rest", run: () => setSleepDialog(true) },
      { id: "new-habit", group: "Azioni", label: "Nuova abitudine", icon: <ListPlus />, run: () => navigate("/habits?new=1") },
      { id: "new-block", group: "Azioni", label: "Nuovo blocco nel planner", icon: <CalendarPlus />, keywords: "schedule event", run: () => navigate("/planner?new=1") },
      ...(["standard", "intense", "recovery"] as Mode[]).map((m) => {
        const Icon = MODE_ICON[m];
        return { id: `mode-${m}`, group: "Modalità", label: `Passa alla modalità ${MODE_COPY[m].label}`, icon: <Icon />, run: () => switchMode(m) };
      }),
      ...navItems.map((n) => ({
        id: `nav-${n.to}`,
        group: "Navigazione",
        label: n.label,
        icon: <n.icon />,
        hint: `G ${n.key.toUpperCase()}`,
        run: () => navigate(n.to),
      })),
      { id: "export", group: "Navigazione", label: "Esporta i miei dati", icon: <Download />, keywords: "backup json", run: () => navigate("/settings#data") },
      { id: "shortcuts", group: "Aiuto", label: "Scorciatoie da tastiera", icon: <Keyboard />, hint: "?", run: () => setShortcuts(true) },
    ];
    return base;
  }, [navigate, openTask, setShortcuts, setSleepDialog, switchMode, navItems]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const cmdMatches = term ? commands.filter((c) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(term)) : commands;
    const taskMatches: Cmd[] = term
      ? (tasks ?? [])
          .filter((t) => t.title.toLowerCase().includes(term))
          .slice(0, 6)
          .map((t) => ({
            id: `task-${t.id}`,
            group: "Attività",
            label: t.title,
            icon: <span className="block size-2 rounded-full" style={{ background: domain(t.domain)?.color ?? "#71717a" }} />,
            hint: t.status === "done" ? "Fatto" : undefined,
            run: () => openTask(t),
          }))
      : [];
    return [...taskMatches, ...cmdMatches];
  }, [q, commands, tasks, domain, openTask]);

  const run = (c: Cmd) => {
    close();
    // Let the palette close before opening another dialog.
    setTimeout(c.run, 0);
  };

  let lastGroup = "";

  return (
    <D.Root open={palette} onOpenChange={(o) => (o ? setPalette(true) : close())}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in" />
        <D.Content
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/60 data-[state=open]:animate-scale-in focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const c = results[idx];
              if (c) run(c);
            }
          }}
        >
          <D.Title className="sr-only">Palette comandi</D.Title>
          <D.Description className="sr-only">Cerca comandi e attività</D.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4 text-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setIdx(0);
              }}
              placeholder="Cerca attività o scrivi un comando…"
              className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none"
              aria-label="Cerca comandi"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={results[idx] ? `cmd-${results[idx].id}` : undefined}
            />
            <Kbd>Esc</Kbd>
          </div>
          <div id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
            {results.length === 0 ? <p className="px-3 py-8 text-center text-xs text-subtle">Nessun risultato per “{q}”.</p> : null}
            {results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {header ? <div className="px-2.5 pt-2.5 pb-1 text-[10px] font-medium tracking-wider text-faint uppercase">{header}</div> : null}
                  <button
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={i === idx}
                    onMouseMove={() => setIdx(i)}
                    onClick={() => run(c)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors [&_svg]:size-4",
                      i === idx ? "bg-white/[0.07] text-fg" : "text-muted",
                    )}
                  >
                    <span className="grid w-4 place-items-center text-subtle">{c.icon}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint ? <span className="font-mono text-[10px] text-faint">{c.hint}</span> : null}
                    {i === idx ? <CornerDownLeft className="size-3.5! text-faint" /> : null}
                  </button>
                </div>
              );
            })}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
