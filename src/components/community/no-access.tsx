import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shell/empty-state";

/** Shown when a member has no community access (ended more than 14 days ago, or not a member). */
export function NoAccess({ message }: { message: string }) {
  return (
    <div className="pt-6">
      <EmptyState title="The community is for members" action={<Button asChild className="h-11"><Link href="/app/plan">See my plan</Link></Button>}>
        {message}
      </EmptyState>
    </div>
  );
}
