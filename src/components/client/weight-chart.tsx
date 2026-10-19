// Small inline SVG line chart of weight check-ins (no chart library: light on 3G).
export function WeightChart({ points }: { points: { date: string; kg: number; label: string }[] }) {
  if (points.length === 0) return null;
  const W = 340, H = 160, PX = 36, PY = 16;
  const kgs = points.map((p) => p.kg);
  let min = Math.min(...kgs), max = Math.max(...kgs);
  if (max - min < 2) { min -= 1; max += 1; }
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points[points.length - 1].date);
  const x = (d: string) => (t1 === t0 ? W / 2 : PX + ((Date.parse(d) - t0) / (t1 - t0)) * (W - PX - 12));
  const y = (kg: number) => PY + ((max - kg) / (max - min)) * (H - PY * 2);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const ticks = [max, (max + min) / 2, min];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label={`Weight from ${points[0].kg} kg to ${points[points.length - 1].kg} kg`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PX} x2={W - 4} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="3 3" />
          <text x={PX - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{t.toFixed(1)}</text>
        </g>
      ))}
      <path d={path} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={4} className="fill-background stroke-primary" strokeWidth={2}>
          <title>{`${p.label}: ${p.kg} kg`}</title>
        </circle>
      ))}
      <text x={PX} y={H - 2} className="fill-muted-foreground text-[10px]">{points[0].label}</text>
      <text x={W - 4} y={H - 2} textAnchor="end" className="fill-muted-foreground text-[10px]">{points[points.length - 1].label}</text>
    </svg>
  );
}
