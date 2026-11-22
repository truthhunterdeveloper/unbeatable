import { describe, expect, it } from "vitest";
import { recoverySlot } from "./checks";

describe("recoverySlot", () => {
  it("trova il primo buco libero oggi senza superare l'ora di dormire", () => {
    const busy = () => [{ start: 900, end: 1000 }];
    expect(recoverySlot(busy, "a", "b", 880, 60, 400, 1290)).toEqual({ date: "a", start: 1005 });
  });
  it("passa a domani se oggi non c'è spazio", () => {
    const busy = (d: string) => (d === "a" ? [{ start: 0, end: 1440 }] : []);
    expect(recoverySlot(busy, "a", "b", 1200, 60, 400, 1290)).toEqual({ date: "b", start: 840 });
  });
});
