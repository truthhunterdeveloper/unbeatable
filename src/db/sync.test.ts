import { describe, expect, it } from "vitest";
import { mergeData } from "./sync";

const empty = () => ({ settings: [], tasks: [], habits: [], habitLogs: [], events: [], focusSessions: [], sleepLogs: [], dayMeta: [], kv: [], goals: [], records: [] }) as Record<string, Record<string, unknown>[]>;

describe("mergeData", () => {
  it("unisce, tiene la versione più recente e applica le eliminazioni", () => {
    const a = empty(), b = empty();
    a.tasks = [{ id: "1", title: "vecchio", updatedAt: 1 }, { id: "2", title: "solo A", updatedAt: 5 }, { id: "3", title: "cancellato su B", updatedAt: 2 }];
    b.tasks = [{ id: "1", title: "nuovo", updatedAt: 9 }, { id: "4", title: "solo B", updatedAt: 3 }];
    a.settings = [{ id: "s", name: "A" }];
    b.settings = [{ id: "s", name: "B" }];
    const r = mergeData(a as never, b, [], [{ key: "tasks:3", table: "tasks", id: "3", at: 4 }]);
    const titles = r.data.tasks.map((t) => t.title).sort();
    expect(titles).toEqual(["nuovo", "solo A", "solo B"]);
    expect(r.data.settings[0].name).toBe("A");
    expect([r.added, r.updated, r.removed]).toEqual([1, 1, 1]);
  });
  it("una modifica dopo l'eliminazione vince", () => {
    const a = empty();
    a.tasks = [{ id: "1", title: "x", updatedAt: 10 }];
    const r = mergeData(a as never, empty(), [], [{ key: "tasks:1", table: "tasks", id: "1", at: 5 }]);
    expect(r.data.tasks).toHaveLength(1);
  });
});
