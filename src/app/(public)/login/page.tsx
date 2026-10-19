import Link from "next/link";
import { LoginForm } from "./login-form";
import { S } from "./strings";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <Link href="/" className="inline-flex min-h-11 items-center text-2xl font-extrabold text-primary">Quest Meals</Link>
        <h1 className="mt-4 text-xl font-bold">{S.title}</h1>
      </div>
      <LoginForm next={safeNext} />
      <p className="text-sm text-muted-foreground">
        {S.noAccount} <Link className="font-semibold text-primary underline" href="/signup">{S.signup}</Link>
      </p>
    </main>
  );
}
