"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions";

/** Runs a server action, shows a toast with the success message or the specific error, then refreshes the page. */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  async function run<T>(fn: () => Promise<ActionResult<T>>, opts: { refresh?: boolean; onDone?: (data: T) => void } = {}) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast.success(res.message);
        opts.onDone?.(res.data);
        if (opts.refresh !== false) startTransition(() => router.refresh());
      } else {
        toast.error(res.error);
      }
      return res;
    } catch {
      toast.error("Could not reach the server. Check the connection and try again.");
      return { ok: false as const, error: "network" };
    } finally {
      setBusy(false);
    }
  }
  return { run, pending: pending || busy };
}
