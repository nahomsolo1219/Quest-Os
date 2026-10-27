/** "2 d 5 h", "3 h 10 min", "12 min"; null when the instant has passed. Shared by the server page and the countdown. */
export function timeLeftText(ms: number): string | null {
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h ${min} min` : `${min} min`;
}
