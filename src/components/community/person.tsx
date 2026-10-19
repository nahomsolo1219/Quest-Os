import { Badge } from "@/components/ui/badge";
import type { Person } from "@/server/services/community";
import { S } from "@/app/app/community/strings";

/** Avatar (signed URL, lazy) or initials, display name and the Coach badge. Never shows contact details. */
export function PersonAvatar({ person, size = 40 }: { person: Pick<Person, "name" | "avatarUrl">; size?: number }) {
  const initials = person.name.replace(/[^\p{L} ]/gu, "").split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  if (person.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.avatarUrl} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" style={{ width: size, height: size }}>
      {initials || "?"}
    </span>
  );
}

export function PersonLine({ person, when }: { person: Person; when?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar person={person} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold">{person.name}</span>
          {person.coach ? <Badge className="bg-primary text-primary-foreground">{S.coach}</Badge> : null}
        </div>
        {when ? <p className="text-xs text-muted-foreground">{when}</p> : null}
      </div>
    </div>
  );
}
