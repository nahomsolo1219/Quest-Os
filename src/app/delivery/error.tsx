"use client";

import { AreaError } from "@/components/shell/area-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AreaError error={error} reset={reset} homeHref="/delivery" homeLabel="Back to my drops" />;
}
