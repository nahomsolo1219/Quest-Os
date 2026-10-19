// Money helpers. Money is integer birr everywhere outside intermediate pricing maths.

const EPS = 1e-9;
const birrFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "58,400 ETB" — whole birr, en-US thousands separators. */
export function formatBirr(n: number): string {
  return `${birrFormat.format(Math.round(n))} ETB`;
}

/** Round to the nearest multiple of step (halves round up). */
export function roundToNearest(n: number, step: number): number {
  if (step <= 0) throw new Error("step must be positive");
  // the epsilon absorbs float noise such as 0.1 + 0.2 so x.5 always rounds up
  return Math.floor(n / step + 0.5 + EPS) * step;
}

/** Round UP to a multiple of step (float noise below 1e-9 of a step is ignored). */
export function ceilTo(n: number, step: number): number {
  if (step <= 0) throw new Error("step must be positive");
  return Math.ceil(n / step - EPS) * step;
}

/** Round DOWN to a multiple of step. */
export function floorTo(n: number, step: number): number {
  if (step <= 0) throw new Error("step must be positive");
  return Math.floor(n / step + EPS) * step;
}

/** Round to a number of decimals without float artefacts in the result (e.g. 0.30000000000000004 -> 0.3). */
export function roundDecimals(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Math.sign(n) * EPS) * f) / f;
}
