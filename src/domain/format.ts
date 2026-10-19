// Small display helpers shared by the UI, labels and the community.
import type { Profile } from "./types";

/** "Dagi K." — first name plus last initial. Never shows a full surname. */
export function displayName(first: string, last: string): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!l) return f;
  const initial = Array.from(l)[0].toLocaleUpperCase("en-US");
  return f ? `${f} ${initial}.` : `${initial}.`;
}

/** "M_LEAN" -> "M-Lean" */
export function profileLabel(profile: Profile): string {
  const [size, goal] = profile.split("_");
  return `${size}-${goal.charAt(0)}${goal.slice(1).toLowerCase()}`;
}

/** Real minus sign (U+2212) for negative numbers, "+" for positive. */
export function signed(n: number, decimals = 1): string {
  const abs = Math.abs(n).toFixed(decimals);
  if (Number(abs) === 0) return abs;
  return n < 0 ? `−${abs}` : `+${abs}`;
}
