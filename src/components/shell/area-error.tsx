"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageScreen } from "./error-screen";

/** Used by every error.tsx: a short apology, "Try again" and a link home. */
export function AreaError({ error, reset, homeHref, homeLabel, showLogo }: {
  error: Error & { digest?: string }; reset: () => void; homeHref: string; homeLabel: string; showLogo?: boolean;
}) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <MessageScreen
      showLogo={showLogo}
      title="Something went wrong"
      body={<>This page could not load. Try again, or go back and carry on.{error.digest ? <span className="mt-2 block text-xs">Reference: {error.digest}</span> : null}</>}
      homeHref={homeHref}
      homeLabel={homeLabel}
      extra={<Button variant="outline" className="h-11" onClick={reset}>Try again</Button>}
    />
  );
}
