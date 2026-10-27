import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Ethiopian mobile number with a fixed, visible +251 prefix: the client types 9XXXXXXXX.
 * The typed text is passed unchanged to `normalizeEthiopianPhone` (src/domain/phone.ts), which also
 * accepts 09…, 07…, +251… and spaces, so pasted or old-style numbers still work.
 */
export function PhoneInput({ className, id, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <div className={cn(
      "flex h-11 w-full items-stretch overflow-hidden rounded-md border border-input bg-card shadow-xs transition-[color,box-shadow]",
      "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive",
      className,
    )}>
      <span id={id ? `${id}-prefix` : undefined} className="flex select-none items-center border-r border-input bg-muted px-3 text-base font-semibold text-foreground tabular md:text-sm">
        +251
      </span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-describedby={id ? `${id}-prefix` : undefined}
        className="min-w-0 flex-1 bg-transparent px-3 text-base tabular outline-none placeholder:text-muted-foreground md:text-sm"
        {...props}
      />
    </div>
  );
}
