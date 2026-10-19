import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A plain <select> styled like the inputs: no extra JavaScript on slow phones. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn("h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm", className)}
      {...props}
    />
  );
}
