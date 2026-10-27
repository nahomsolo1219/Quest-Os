"use client";

import { useEffect, useState } from "react";
import { timeLeftText } from "./time-left";

/**
 * Ticks the time left until a server-given instant. The server's "now" corrects for a wrong
 * phone clock; the initial text is rendered on the server so it works without JS.
 */
export function LiveTimeLeft({ to, serverNow, initial, passedLabel, className }: {
  to: string; serverNow: string; initial: string; passedLabel: string; className?: string;
}) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now();
    const tick = () => setText(timeLeftText(new Date(to).getTime() - (Date.now() + skew)) ?? passedLabel);
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [to, serverNow, passedLabel]);
  return <span className={className}>{text}</span>;
}
