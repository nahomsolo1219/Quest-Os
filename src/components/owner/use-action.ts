"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions";

/** Runs a server action, shows the success message or the specific error as a toast, and refreshes the page data. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run<T>(call: () => Promise<ActionResult<T>>, onOk?: (data: T) => void, fallback = "Saved.") {
    start(async () => {
      const r = await call();
      if (r.ok) {
        toast.success(r.message ?? fallback);
        onOk?.(r.data);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  return { pending, run };
}
