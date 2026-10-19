// Delivery: drop list grouped by area, route reordering (module 10).

export type DropRow = {
  id: string;
  areaId: string | null;
  areaName: string | null;
  areaSort: number | null;
  routePosition: number;
};

export type AreaGroup<T extends DropRow> = { areaId: string | null; areaName: string; drops: T[] };

/** Areas sorted by their sort order (then name); drops by route position. Drops without an area come last. */
export function groupDropsByArea<T extends DropRow>(drops: T[]): AreaGroup<T>[] {
  const groups = new Map<string, { areaId: string | null; areaName: string; sort: number; drops: T[] }>();
  for (const d of drops) {
    const key = d.areaId ?? "__none__";
    let g = groups.get(key);
    if (!g) {
      g = { areaId: d.areaId, areaName: d.areaName ?? "No area", sort: d.areaId == null ? Number.POSITIVE_INFINITY : d.areaSort ?? 0, drops: [] };
      groups.set(key, g);
    }
    g.drops.push(d);
  }
  return [...groups.values()]
    .sort((a, b) => a.sort - b.sort || a.areaName.localeCompare(b.areaName))
    .map((g) => ({ areaId: g.areaId, areaName: g.areaName, drops: [...g.drops].sort((a, b) => a.routePosition - b.routePosition || a.id.localeCompare(b.id)) }));
}

/** Moves one drop and renumbers route positions 1..n. Returns a new array; out-of-range indexes are clamped. */
export function reorder<T extends { routePosition: number }>(drops: T[], fromIndex: number, toIndex: number): T[] {
  const list = [...drops];
  if (list.length === 0) return list;
  const from = Math.min(Math.max(0, fromIndex), list.length - 1);
  const to = Math.min(Math.max(0, toIndex), list.length - 1);
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list.map((d, i) => ({ ...d, routePosition: i + 1 }));
}
