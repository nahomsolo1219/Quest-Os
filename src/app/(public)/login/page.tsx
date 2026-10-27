import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { LoginForm } from "./login-form";
import { S } from "./strings";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <div className="flex flex-col items-center text-center">
        <Link href="/" aria-label="Quest Meals home" className="inline-flex p-2"><Logo variant="full" height={80} priority /></Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-primary">{S.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{S.intro}</p>
      </div>
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <LoginForm next={safeNext} />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {S.noAccount}{" "}
        <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4" href="/signup">{S.signup}</Link>
      </p>
    </main>
  );
}
