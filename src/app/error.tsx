"use client";

import { AreaError } from "@/components/shell/area-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main><AreaError error={error} reset={reset} homeHref="/" homeLabel="Go to the home page" showLogo /></main>;
}
