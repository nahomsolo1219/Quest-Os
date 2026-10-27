import { RotateCw, WifiOff } from "lucide-react";
import { Logo } from "@/components/shell/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-8 text-center">
      <Logo variant="full" height={80} />
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary"><WifiOff className="size-6" aria-hidden /></span>
        <h1 className="mt-3 text-xl font-semibold text-primary">You are offline</h1>
        <p className="mt-2 text-muted-foreground">
          Check your mobile data or Wi-Fi, then try again. Your plan and orders are safe.
        </p>
        {/* plain link to the current address: reloads with no JavaScript, which may not be cached offline */}
        <a href="" className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90">
          <RotateCw className="size-4" aria-hidden /> Try again
        </a>
      </div>
    </main>
  );
}
