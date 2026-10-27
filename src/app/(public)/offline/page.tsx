import { Logo } from "@/components/shell/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <Logo variant="full" height={88} className="mb-4" />
      <h1 className="text-xl font-semibold">You are offline</h1>
      <p className="text-muted-foreground">
        Check your mobile data or Wi-Fi, then try again. Your plan and orders are safe.
      </p>
    </main>
  );
}
