"use client";

import { useEffect, useState } from "react";
import { timeLeftText as left } from "@/components/shell/time-left";

/** Time left until an instant; updates every 30 s. Initial text comes from the server so it renders without JS. */
export function Countdown({ to, initial, passedLabel }: { to: string; initial: string; passedLabel: string }) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const tick = () => setText(left(new Date(to).getTime() - Date.now()) ?? passedLabel);
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [to, passedLabel]);
  return <span className="stat-number">{text}</span>;
}
