import { Clock } from "lucide-react";
import { addisDate, addisTime, formatDate } from "@/domain/time";
import { cn } from "@/lib/utils";
import { LiveTimeLeft } from "./live-time-left";
import { timeLeftText } from "./time-left";
import { TONE_TEXT } from "./status-badge";

/** "Thu 6 pm" / "Thu 6:30 pm" in Addis time for a cutoff instant. */
export function addisShortLabel(instant: Date): string {
  const [hh, mm] = addisTime(instant).split(":").map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const day = formatDate(addisDate(instant)).split(" ")[0];
  return `${day} ${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "am" : "pm"}`;
}

/**
 * Deadline line used wherever a cutoff matters: "Change by Thu 6 pm · 2 d 7 h left".
 * `cutoff` and `now` come from the server (services decide the cutoff; time via src/domain/time.ts).
 * Turns amber inside the last day and says `passedLabel` once it has passed.
 */
export function Deadline({ cutoff, now, verb = "Change by", passedLabel = "Cutoff passed", className }: {
  cutoff: Date; now: Date; verb?: string; passedLabel?: string; className?: string;
}) {
  const ms = cutoff.getTime() - now.getTime();
  const initial = timeLeftText(ms) ?? passedLabel;
  const soon = ms > 0 && ms < 24 * 3_600_000;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-sm", ms <= 0 ? TONE_TEXT.bad : soon ? TONE_TEXT.warn : "text-muted-foreground", className)}>
      <Clock aria-hidden className="size-4 shrink-0" />
      <span>{verb} {addisShortLabel(cutoff)}</span>
      <span aria-hidden>·</span>
      <span className="font-semibold tabular">
        <LiveTimeLeft to={cutoff.toISOString()} serverNow={now.toISOString()} initial={initial} passedLabel={passedLabel} />
        {ms > 0 ? " left" : null}
      </span>
    </p>
  );
}
