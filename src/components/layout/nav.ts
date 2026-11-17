import { Sparkles, BarChart3, BookOpen, ClipboardCheck, Briefcase, CalendarDays, Flag, GraduationCap, LayoutGrid, ListChecks, Repeat2, Settings2, Sprout, Timer, Trophy, type LucideIcon } from "lucide-react";

export type NavItem = { to: string; label: string; short: string; icon: LucideIcon; key: string; domain?: string };

/** `key` is the second key of the "g then key" navigation shortcut. */
export const NAV: NavItem[] = [
  { to: "/", label: "Centro di comando", short: "Oggi", icon: LayoutGrid, key: "c" },
  { to: "/ai", label: "Coach AI", short: "Coach", icon: Sparkles, key: "i" },
  { to: "/tasks", label: "Attività", short: "Attività", icon: ListChecks, key: "t" },
  { to: "/habits", label: "Abitudini", short: "Abitudini", icon: Repeat2, key: "h" },
  { to: "/focus", label: "Lavoro profondo", short: "Focus", icon: Timer, key: "f" },
  { to: "/planner", label: "Planner", short: "Planner", icon: CalendarDays, key: "p" },
  { to: "/goals", label: "Obiettivi", short: "Obiettivi", icon: Flag, key: "o" },
  { to: "/review", label: "Revisione settimanale", short: "Revisione", icon: ClipboardCheck, key: "v" },
  { to: "/analytics", label: "Analisi", short: "Analisi", icon: BarChart3, key: "l" },
];

/** Life-domain modules; shown only when the matching domain is enabled. */
export const DOMAIN_NAV: NavItem[] = [
  { to: "/deen", label: "Deen", short: "Deen", icon: BookOpen, key: "d", domain: "deen" },
  { to: "/football", label: "Calcio", short: "Calcio", icon: Trophy, key: "a", domain: "football" },
  { to: "/business", label: "Business", short: "Business", icon: Briefcase, key: "b", domain: "business" },
  { to: "/school", label: "Scuola", short: "Scuola", icon: GraduationCap, key: "u", domain: "school" },
  { to: "/personal", label: "Crescita personale", short: "Crescita", icon: Sprout, key: "r", domain: "personal" },
];

export const SETTINGS_NAV: NavItem = { to: "/settings", label: "Impostazioni", short: "Impostazioni", icon: Settings2, key: "s" };

export const MOBILE_NAV = NAV.slice(0, 4);
