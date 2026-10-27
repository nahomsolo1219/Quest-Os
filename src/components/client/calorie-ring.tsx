/** Today's calories against the target: lime arc on an oat track, number in the middle (server-rendered SVG). */
export function CalorieRing({ kcal, target, size = 120 }: { kcal: number; target: number | null; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target && target > 0 ? Math.min(kcal / target, 1) : 0;
  const label = target ? `${kcal.toLocaleString("en-US")} of ${target.toLocaleString("en-US")} kcal` : `${kcal.toLocaleString("en-US")} kcal`;
  return (
    <div role="img" aria-label={`Today: ${label}`} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-oat" />
        {pct > 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-lime"
            strokeDasharray={`${c * pct} ${c}`} />
        ) : null}
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="stat-number text-2xl text-primary">{kcal.toLocaleString("en-US")}</span>
        <span className="mt-1 text-[11px] font-medium text-muted-foreground tabular">
          {target ? `of ${target.toLocaleString("en-US")} kcal` : "kcal"}
        </span>
      </div>
    </div>
  );
}
