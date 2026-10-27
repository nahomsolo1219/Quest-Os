import Link from "next/link";
import { cn } from "@/lib/utils";
import { S } from "@/app/app/community/strings";

const CHIPS = [
  { key: null, label: S.filters.all },
  { key: "question", label: S.filters.question },
  { key: "progress", label: S.filters.progress },
  { key: "announcement", label: S.filters.announcement },
] as const;

/** Feed filter chips: All, Questions, Progress, Announcements (links, no client JS). */
export function TypeChips({ active }: { active: string | null }) {
  return (
    <nav aria-label="Filter posts" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] sm:[mask-image:none]">
      {CHIPS.map((c) => {
        const on = (c.key ?? null) === active;
        return (
          <Link key={c.label} href={c.key ? `/app/community?type=${c.key}` : "/app/community"} aria-current={on ? "page" : undefined}
            className={cn("flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold last:mr-6",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}
