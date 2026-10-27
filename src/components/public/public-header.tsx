import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { getActor } from "@/server/session";
import { homePathFor } from "@/server/authz";
import { cn } from "@/lib/utils";

/**
 * Top bar of the public pages: logo left; "Go to my app" (to the role's home) when signed in,
 * otherwise "Sign in". Reads the session, so pages using it must be `dynamic = "force-dynamic"`.
 * `reversed` is for use on the Deep Forest hero.
 */
export async function PublicHeader({ reversed = false, hideSignIn = false }: { reversed?: boolean; hideSignIn?: boolean }) {
  const actor = await getActor();
  return (
    <header className="flex h-16 items-center justify-between gap-3">
      <Link href="/" aria-label="Quest Meals home" className="flex min-h-11 items-center">
        <Logo variant={reversed ? "horizontal-reversed" : "horizontal"} height={28} priority />
      </Link>
      {actor ? (
        <Link href={homePathFor(actor.roles)}
          className={cn("flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors",
            reversed ? "bg-lime text-forest hover:bg-lime/90" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
          Go to my app <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : hideSignIn ? null : (
        <Link href="/login"
          className={cn("flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold transition-colors",
            reversed ? "border-white/30 text-white hover:bg-white/10" : "border-border bg-card text-primary hover:bg-accent")}>
          Sign in
        </Link>
      )}
    </header>
  );
}
