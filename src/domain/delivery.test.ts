import { describe, expect, it } from "vitest";
import { groupDropsByArea, reorder, type DropRow } from "./delivery";

const d = (id: string, areaId: string | null, areaSort: number | null, routePosition: number): DropRow => ({
  id, areaId, areaName: areaId ? `Area ${areaId}` : null, areaSort, routePosition,
});

describe("delivery", () => {
  it("groups by area sort, then route position; no area last", () => {
    const g = groupDropsByArea([d("1", "kaz", 2, 2), d("2", "bole", 1, 3), d("3", null, null, 1), d("4", "kaz", 2, 1), d("5", "bole", 1, 1)]);
    expect(g.map((x) => x.areaName)).toEqual(["Area bole", "Area kaz", "No area"]);
    expect(g[0].drops.map((x) => x.id)).toEqual(["5", "2"]);
    expect(g[1].drops.map((x) => x.id)).toEqual(["4", "1"]);
    expect(groupDropsByArea([])).toEqual([]);
  });

  it("reorders and renumbers route positions without mutating the input", () => {
    const list = [d("a", "x", 1, 1), d("b", "x", 1, 2), d("c", "x", 1, 3)];
    const r = reorder(list, 2, 0);
    expect(r.map((x) => [x.id, x.routePosition])).toEqual([["c", 1], ["a", 2], ["b", 3]]);
    expect(list.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(reorder(list, 0, 10).map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(reorder([], 0, 1)).toEqual([]);
  });
});
