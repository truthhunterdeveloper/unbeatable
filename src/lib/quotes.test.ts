import { describe, expect, it } from "vitest";
import { QUOTES, dailyIndex } from "./quotes";

describe("motivational quotes", () => {
  it("has at least 40 unique quotes per area", () => {
    for (const [area, list] of Object.entries(QUOTES)) {
      expect(list.length, area).toBeGreaterThanOrEqual(40);
      expect(new Set(list).size, area).toBe(list.length);
    }
  });
  it("picks a stable quote of the day", () => {
    expect(dailyIndex("deen", "2026-11-17")).toBe(dailyIndex("deen", "2026-11-17"));
    expect(dailyIndex("deen", "2026-11-17")).toBeLessThan(50);
  });
});
