"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions";

/** Runs a server action, toasts the success message or the specific error, then refreshes the server components. */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void, fallback = "Saved.") {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? fallback);
        onOk?.(r.data);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }
  return { pending, run };
}
