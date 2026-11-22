import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";

export const PRAYERS = [
  ["fajr", "Fajr"],
  ["dhuhr", "Dhuhr"],
  ["asr", "Asr"],
  ["maghrib", "Maghrib"],
  ["isha", "Isha"],
] as const;

/** The five prayer times for a date (local time), Muslim World League method. */
export function prayerTimes(lat: number, lon: number, date: Date): { key: string; name: string; at: Date }[] {
  const p = new PrayerTimes(new Coordinates(lat, lon), date, CalculationMethod.MuslimWorldLeague());
  return PRAYERS.map(([key, name]) => ({ key, name, at: p[key] }));
}

export function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
