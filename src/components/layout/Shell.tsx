import { useEffect, useRef } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { Keyboard, LayoutList, Pause, Search, Timer } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useFocus } from "@/features/focus/FocusProvider";
import { MOBILE_NAV, NAV, SETTINGS_NAV, type NavItem } from "./nav";
import { useNavItems } from "@/hooks/nav";
import { ModeSwitcher, MODE_ICON, MODE_COLOR } from "./ModeSwitcher";
import { CommandPalette } from "./CommandPalette";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { ErrorBoundary } from "./ErrorBoundary";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { SleepDialog } from "@/features/command/SleepDialog";
import { HabitReminders } from "@/features/habits/HabitReminders";
import { CommandCenter } from "@/features/command/CommandCenter";
import { TasksPage } from "@/features/tasks/TasksPage";
import { HabitsPage } from "@/features/habits/HabitsPage";
import { FocusPage } from "@/features/focus/FocusPage";
import { PlannerPage } from "@/features/planner/PlannerPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { GoalsPage } from "@/features/goals/GoalsPage";
import { ReviewPage } from "@/features/review/ReviewPage";
import { AnalyticsPage } from "@/features/review/AnalyticsPage";
import { DeenPage } from "@/features/domains/DeenPage";
import { FootballPage } from "@/features/domains/FootballPage";
import { BusinessPage } from "@/features/domains/BusinessPage";
import { SchoolPage } from "@/features/domains/SchoolPage";
import { PersonalPage } from "@/features/domains/PersonalPage";
import { Kbd } from "@/components/ui/misc";
import { MODE_COPY } from "@/lib/mission";
import { formatClock } from "@/lib/date";
import { remainingMs } from "@/lib/focus";
import { cn, isTypingTarget } from "@/lib/utils";

function useGlobalShortcuts() {
  const { setPalette, openTask, setShortcuts } = useApp();
  const items = useNavItems();
  const navigate = useNavigate();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;

      if (pendingG.current) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const item = items.find((n) => n.key === e.key.toLowerCase());
        if (item) {
          e.preventDefault();
          navigate(item.to);
        }
        return;
      }
      if (e.key === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
        return;
      }
      if (e.key === "n") {
        e.preventDefault();
        openTask();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcuts(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, openTask, setPalette, setShortcuts, items]);
}

function FocusPill({ className }: { className?: string }) {
  const { active, now } = useFocus();
  const navigate = useNavigate();
  const loc = useLocation();
  if (!active || loc.pathname === "/focus") return null;
  const paused = active.phase === "focus" && active.runningSince == null;
  const label = active.phase === "review" ? "Sessione completata" : active.phase === "break" ? "Pausa" : active.label;
  return (
    <button
      onClick={() => navigate("/focus")}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border border-accent/25 bg-accent-soft px-3 py-2 text-left transition-colors hover:border-accent/40",
        className,
      )}
    >
      {paused ? <Pause className="size-3.5 text-accent" /> : <Timer className="size-3.5 animate-breathe text-accent" />}
      <span className="min-w-0 flex-1 truncate text-xs text-fg">{label}</span>
      {active.phase !== "review" ? <span className="font-mono text-xs text-accent tabular">{formatClock(remainingMs(active, now))}</span> : null}
    </button>
  );
}

function SideLink({ n }: { n: NavItem }) {
  return (
    <NavLink
      to={n.to}
      end={n.to === "/"}
      className={({ isActive }) =>
        cn(
          "group flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
          isActive ? "bg-white/[0.07] font-medium text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg",
        )
      }
    >
      <n.icon className="size-4 opacity-80" />
      <span className="flex-1 truncate">{n.label}</span>
      <span className="font-mono text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100">G {n.key.toUpperCase()}</span>
    </NavLink>
  );
}

function Sidebar() {
  const { setPalette, setShortcuts, settings } = useApp();
  const domainItems = useNavItems().filter((n) => n.domain);
  const ModeIcon = MODE_ICON[settings.mode];
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-line bg-[#070911]/85 backdrop-blur-xl px-3 py-4 min-[560px]:flex">
      <div className="flex items-center gap-2.5 px-2 pb-4">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-7" />
        <div className="text-[13px] font-semibold tracking-tight text-fg">Unbeatable</div>
      </div>

      <button
        onClick={() => setPalette(true)}
        className="mb-4 flex h-8 items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-2.5 text-xs text-subtle transition-colors hover:border-line-strong hover:text-muted"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Cerca o esegui…</span>
        <Kbd>Ctrl K</Kbd>
      </button>

      <nav aria-label="Principale" className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {NAV.map((n) => (
          <SideLink key={n.to} n={n} />
        ))}
        {domainItems.length ? <div className="mt-4 mb-1 px-2.5 text-[10px] font-medium tracking-wider text-faint uppercase">Aree di vita</div> : null}
        {domainItems.map((n) => (
          <SideLink key={n.to} n={n} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-3">
        <FocusPill />
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-medium tracking-wider text-faint uppercase">
            <ModeIcon className={cn("size-3", MODE_COLOR[settings.mode])} /> Modalità · {MODE_COPY[settings.mode].label}
          </div>
          <ModeSwitcher />
        </div>
        <div className="flex items-center gap-1 border-t border-line pt-3">
          <NavLink
            to={SETTINGS_NAV.to}
            className={({ isActive }) =>
              cn(
                "flex h-8 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
                isActive ? "bg-white/[0.07] text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg",
              )
            }
          >
            <SETTINGS_NAV.icon className="size-4 opacity-80" /> Impostazioni
          </NavLink>
          <button onClick={() => setShortcuts(true)} className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-white/[0.04] hover:text-fg" aria-label="Scorciatoie da tastiera">
            <Keyboard className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileBar() {
  const { setPalette, settings } = useApp();
  const ModeIcon = MODE_ICON[settings.mode];
  return (
    <header className="sticky top-0 z-30 flex min-h-12 items-center gap-2 border-b border-line bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur min-[560px]:hidden">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-6" />
      <span className="text-[13px] font-semibold tracking-tight">Unbeatable</span>
      <span className={cn("ml-1 flex items-center gap-1 text-[11px] text-subtle")}>
        <ModeIcon className={cn("size-3", MODE_COLOR[settings.mode])} />
        {MODE_COPY[settings.mode].short}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={() => setPalette(true)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/5" aria-label="Cerca e comandi">
          <Search className="size-4" />
        </button>
        <NavLink to="/settings" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/5" aria-label="Impostazioni">
          <SETTINGS_NAV.icon className="size-4" />
        </NavLink>
      </div>
    </header>
  );
}

function MobileNav() {
  return (
    <nav aria-label="Principale" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur min-[560px]:hidden">
      <div className="grid grid-cols-5">
        {[...MOBILE_NAV, { to: "/more", label: "Altro", short: "Altro", icon: LayoutList, key: "" }].map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            className={({ isActive }) => cn("flex h-14 flex-col items-center justify-center gap-1 text-[10px] transition-colors", isActive ? "text-fg" : "text-subtle")}
          >
            <n.icon className="size-[18px]" />
            {n.short}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Shell() {
  useGlobalShortcuts();
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="min-[560px]:pl-[240px]">
        <MobileBar />
        <AudioPlayer />
        <main className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] min-[560px]:pt-9 min-[560px]:pb-12 sm:px-6 md:px-10">
          <div className="min-[560px]:hidden">
            <FocusPill className="mb-4" />
          </div>
          <ErrorBoundary key={loc.pathname}>
            <div className="animate-rise">
              <Routes>
                <Route path="/" element={<CommandCenter />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/habits" element={<HabitsPage />} />
                <Route path="/focus" element={<FocusPage />} />
                <Route path="/planner" element={<PlannerPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/goals" element={<GoalsPage />} />
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/deen" element={<DeenPage />} />
                <Route path="/football" element={<FootballPage />} />
                <Route path="/business" element={<BusinessPage />} />
                <Route path="/school" element={<SchoolPage />} />
                <Route path="/personal" element={<PersonalPage />} />
                <Route path="/more" element={<MorePage />} />
                <Route path="*" element={<CommandCenter />} />
              </Routes>
            </div>
          </ErrorBoundary>
        </main>
      </div>
      <MobileNav />
      <TaskFormDialog />
      <SleepDialog />
      <CommandPalette />
      <ShortcutsDialog />
      <HabitReminders />
    </div>
  );
}

/** Mobile: every module that doesn't fit in the bottom bar. */
function MorePage() {
  const items = useNavItems().filter((n) => !MOBILE_NAV.includes(n));
  return (
    <div>
      <h1 className="mb-5 text-[22px] font-semibold tracking-tight">Tutti i moduli</h1>
      <div className="grid grid-cols-2 gap-2">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} className="card flex items-center gap-3 p-4 text-[13px] text-fg">
            <n.icon className="size-4 text-subtle" />
            {n.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
