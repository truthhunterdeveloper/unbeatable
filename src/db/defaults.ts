import type { Domain, EventCategory, Habit, Settings } from "./schema";
import { defaultTimeZone } from "@/lib/date";

export const DOMAIN_PALETTE = [
  "#34d399", // emerald
  "#60a5fa", // blue
  "#f5b14c", // amber
  "#a78bfa", // violet
  "#f472b6", // pink
  "#2dd4bf", // teal
  "#fb923c", // orange
  "#94a3b8", // slate
] as const;

export const DEFAULT_DOMAINS: Domain[] = [
  { id: "deen", label: "Deen", color: "#7fa892", enabled: true },
  { id: "football", label: "Calcio", color: "#7f98b3", enabled: true },
  { id: "business", label: "Business", color: "#b5a07a", enabled: true },
  { id: "school", label: "Scuola", color: "#9a90b0", enabled: true },
  { id: "personal", label: "Crescita", color: "#b08f9c", enabled: true },
];

export function defaultSettings(): Settings {
  return {
    id: "settings",
    name: "",
    timeZone: defaultTimeZone(),
    weekStart: 1,
    domains: DEFAULT_DOMAINS.map((d) => ({ ...d })),
    wakeTime: "06:30",
    bedTime: "22:00",
    focusMinutes: 25,
    breakMinutes: 5,
    longFocusMinutes: 90,
    mode: "standard",
    notifications: false,
    onboardedAt: null,
    createdAt: Date.now(),
  };
}

export const EVENT_CATEGORIES: { id: EventCategory; label: string; color: string }[] = [
  { id: "school", label: "Scuola", color: "#a78bfa" },
  { id: "study", label: "Studio", color: "#c4b5fd" },
  { id: "football", label: "Calcio", color: "#60a5fa" },
  { id: "refereeing", label: "Arbitraggio", color: "#38bdf8" },
  { id: "deen", label: "Deen", color: "#34d399" },
  { id: "business", label: "Business", color: "#f5b14c" },
  { id: "meal", label: "Pasto", color: "#a1a1aa" },
  { id: "break", label: "Pausa", color: "#71717a" },
  { id: "personal", label: "Personale", color: "#f472b6" },
  { id: "other", label: "Altro", color: "#94a3b8" },
];

export function categoryMeta(id: EventCategory) {
  return EVENT_CATEGORIES.find((c) => c.id === id) ?? EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

/** Suggestions offered during onboarding. Nothing is pre-selected; all are editable later. */
export type HabitTemplate = Pick<Habit, "name" | "description" | "domain" | "frequency" | "target" | "unit" | "estimateMin" | "tier">;

export const HABIT_TEMPLATES: HabitTemplate[] = [
  { name: "Pregare la Salah", description: "Le cinque preghiere quotidiane.", domain: "deen", frequency: { type: "daily" }, target: 5, unit: "preghiere", estimateMin: 50, tier: "essential" },
  { name: "Leggere il Corano", description: "Recitazione quotidiana.", domain: "deen", frequency: { type: "daily" }, target: 1, unit: "", estimateMin: 15, tier: "standard" },
  { name: "Studiare matematica", description: "Esercizi concentrati, non solo rileggere gli appunti.", domain: "school", frequency: { type: "days", days: [1, 2, 3, 4, 5] }, target: 1, unit: "", estimateMin: 45, tier: "standard" },
  { name: "Tecnica calcistica", description: "Piede debole, primo controllo, finalizzazione.", domain: "football", frequency: { type: "weekly", timesPerWeek: 3 }, target: 1, unit: "", estimateMin: 30, tier: "standard" },
  { name: "Un'azione per il business", description: "Porta a termine un'azione concreta.", domain: "business", frequency: { type: "days", days: [1, 2, 3, 4, 5] }, target: 1, unit: "", estimateMin: 30, tier: "standard" },
  { name: "Leggere", description: "Libri, non feed.", domain: "personal", frequency: { type: "daily" }, target: 10, unit: "pagine", estimateMin: 20, tier: "optional" },
  { name: "Dormire in orario", description: "A letto entro l'orario che hai impostato.", domain: "personal", frequency: { type: "daily" }, target: 1, unit: "", estimateMin: null, tier: "essential" },
];
