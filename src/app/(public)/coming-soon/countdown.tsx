"use client";

import { useEffect, useState } from "react";

/** Launch: Monday 30 November 2026, 00:00 Addis Ababa (UTC+3). */
const LAUNCH = Date.UTC(2026, 10, 29, 21, 0, 0);

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { v: Math.floor(s / 86400), l: "days" },
    { v: Math.floor((s % 86400) / 3600), l: "hours" },
    { v: Math.floor((s % 3600) / 60), l: "min" },
  ];
}

export function Countdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null || now >= LAUNCH) return null;
  return (
    <div className="mt-8 flex gap-3" aria-label="Time until launch">
      {parts(LAUNCH - now).map((p) => (
        <div key={p.l} className="min-w-20 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center">
          <p className="tabular text-3xl font-bold text-white">{p.v}</p>
          <p className="text-xs uppercase tracking-wider text-mist/70">{p.l}</p>
        </div>
      ))}
    </div>
  );
}
