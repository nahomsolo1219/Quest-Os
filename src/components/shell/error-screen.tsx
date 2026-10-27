import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";

/** Brand-style full message for errors and missing pages, always with a way back. */
export function MessageScreen({ title, body, homeHref, homeLabel, extra, showLogo }: {
  title: string; body: ReactNode; homeHref: string; homeLabel: string; extra?: ReactNode; showLogo?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      {showLogo ? <Logo variant="full" height={80} className="mb-4" /> : <Logo variant="mark" height={48} className="mb-2" />}
      <h1 className="text-2xl font-semibold text-primary">{title}</h1>
      <div className="text-muted-foreground">{body}</div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {extra}
        <Link href={homeHref} className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{homeLabel}</Link>
      </div>
    </div>
  );
}
