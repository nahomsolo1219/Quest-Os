"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type Account = { role: string; name: string; login: string; kind: "email" | "phone"; password: string; note: string };

/** Demo copy only: sign in as any demo account with one tap. */
export function TryARole({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (a: Account) => {
    setBusy(a.login); setError(null);
    const { error: e } = a.kind === "email"
      ? await authClient.signIn.email({ email: a.login, password: a.password })
      : await authClient.signIn.phoneNumber({ phoneNumber: a.login, password: a.password });
    if (e) { setError(`Could not sign in as ${a.name}. Try again in a few seconds.`); setBusy(null); return; }
    router.replace("/go");
    router.refresh();
  };
  return (
    <section aria-labelledby="try-a-role" data-demo-roles className="rounded-2xl border border-lime/60 bg-card p-4 shadow-sm sm:p-6">
      <h2 id="try-a-role" className="text-lg font-semibold text-primary">Try a role</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sign in with one tap. Each role starts with a short guided tour.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {accounts.map((a) => (
          <li key={a.login}>
            <button type="button" disabled={busy !== null} onClick={() => go(a)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left hover:border-primary hover:bg-accent disabled:opacity-60">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{a.role} · {a.name}</span>
                <span className="block text-xs text-muted-foreground">{busy === a.login ? "Signing in…" : a.note}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
