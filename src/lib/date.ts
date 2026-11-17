/**
 * Date utilities. Calendar dates are ISO strings ("YYYY-MM-DD") interpreted in
 * the user's configured time zone. Arithmetic is done in UTC on those strings,
 * which avoids daylight-saving drift.
 */

export const DAY_MS = 86_400_000;
export const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] as const;
export const WEEKDAY_LETTER = ["D", "L", "M", "M", "G", "V", "S"] as const;

export function safeTimeZone(tz: string | undefined): string {
  if (!tz) return defaultTimeZone();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return defaultTimeZone();
  }
}

export function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    const zones = intl.supportedValuesOf?.("timeZone");
    if (zones && zones.length) return zones;
  } catch {
    /* fall through */
  }
  return [defaultTimeZone(), "UTC"];
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimeZone(tz),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(tz, f);
  }
  return f;
}

function zonedParts(ms: number, tz: string) {
  const parts = partsFormatter(tz).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { y: get("year"), m: get("month"), d: get("day"), h: Number(get("hour")) % 24, min: Number(get("minute")) };
}

/** Calendar date for a timestamp in the given time zone. */
export function dateOfMs(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.y}-${p.m}-${p.d}`;
}

export function todayISO(tz: string, now = Date.now()): string {
  return dateOfMs(now, tz);
}

/** Minutes since local midnight in the given time zone. */
export function minutesOfDay(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return p.h * 60 + p.min;
}

export function timeOfMs(ms: number, tz: string): string {
  return minToHm(minutesOfDay(ms, tz));
}

function parseISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUTC(parseISO(iso) + n * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return new Date(parseISO(iso)).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to) - parseISO(from)) / DAY_MS);
}

export function startOfWeek(iso: string, weekStart: 0 | 1 = 1): string {
  const diff = (weekday(iso) - weekStart + 7) % 7;
  return addDays(iso, -diff);
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}

/** Inclusive list of dates. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

export function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function minToHm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Sleep length for a bedtime/wake pair, crossing midnight when needed. */
export function sleepMinutes(bed: string, wake: string): number {
  const d = (hmToMin(wake) - hmToMin(bed) + 1440) % 1440;
  return d === 0 ? 1440 : d;
}

/** Awake window in minutes [wake, bed], where bed may exceed 1440 (after midnight). */
export function awakeWindow(wake: string, bed: string): { start: number; end: number } {
  const w = hmToMin(wake);
  let b = hmToMin(bed);
  if (b <= w) b += 1440;
  return { start: w, end: b };
}

const longFmt = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayMonthFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });

export function formatLong(iso: string): string {
  return capitalize(longFmt.format(new Date(parseISO(iso))));
}
export function formatShort(iso: string): string {
  return shortFmt.format(new Date(parseISO(iso)));
}
export function formatDayMonth(iso: string): string {
  return dayMonthFmt.format(new Date(parseISO(iso)));
}
export function formatMonth(iso: string): string {
  return monthFmt.format(new Date(parseISO(iso)));
}

/** "Today", "Tomorrow", "Yesterday", weekday name within a week, else "12 Nov". */
export function relativeDay(iso: string, today: string): string {
  const d = daysBetween(today, iso);
  if (d === 0) return "Oggi";
  if (d === 1) return "Domani";
  if (d === -1) return "Ieri";
  if (d > 1 && d < 7) return WEEKDAY_SHORT[weekday(iso)];
  return formatDayMonth(iso);
}

export function formatDuration(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function greetingFor(minutes: number): string {
  if (minutes < 5 * 60) return "Buonanotte";
  if (minutes < 12 * 60) return "Buongiorno";
  if (minutes < 18 * 60) return "Buon pomeriggio";
  return "Buonasera";
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
