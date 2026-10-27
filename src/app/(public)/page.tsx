import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calculator, ClipboardCheck, Truck } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { PublicHeader } from "@/components/public/public-header";
import { BrandRings } from "@/components/public/brand-rings";
import { Button } from "@/components/ui/button";
import { getActor } from "@/server/session";
import { homePathFor } from "@/server/authz";
import { S } from "./strings";

// reads the session (header + hero button) and checks for the optional hero photo per request
export const dynamic = "force-dynamic";

/** Optional photo slot: drop a food photo at public/brand/hero.jpg and it replaces the logo panel. */
const HERO_PHOTO = "/brand/hero.jpg";
const hasHeroPhoto = () => existsSync(path.join(process.cwd(), "public", "brand", "hero.jpg"));

const STEP_ICONS = [Calculator, ClipboardCheck, Truck];

export default async function Home() {
  const actor = await getActor();
  const photo = hasHeroPhoto();
  return (
    <main>
      <section className="relative overflow-hidden bg-forest text-mist">
        <BrandRings className="pointer-events-none absolute -right-24 -top-24 size-[22rem] text-lime/15 lg:-right-10 lg:size-[30rem]" />
        <div className="relative mx-auto w-full max-w-5xl px-4 pb-12 lg:pb-16">
          <PublicHeader reversed />
          <div className="grid items-center gap-10 pt-8 lg:grid-cols-[1.15fr_1fr] lg:pt-12">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-lime">{S.eyebrow}</p>
              <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">{S.title}</h1>
              <p className="mt-4 max-w-prose text-lg text-mist/85">{S.intro}</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 bg-lime px-6 text-base text-forest hover:bg-lime/90">
                  <Link href="/calculator">{S.ctaCalc}</Link>
                </Button>
                {actor ? (
                  <Button asChild size="lg" variant="outline" className="h-12 border-white/40 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white">
                    <Link href={homePathFor(actor.roles)}>{S.ctaApp} <ArrowRight className="size-4" aria-hidden /></Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" variant="outline" className="h-12 border-white/40 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white">
                    <Link href="/signup">{S.ctaSignup}</Link>
                  </Button>
                )}
              </div>
              {actor ? null : <p className="mt-3 text-sm text-mist/75">{S.cutoffNote}</p>}
            </div>
            {photo ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-white/10">
                <Image src={HERO_PHOTO} alt={S.photoAlt} fill priority sizes="(min-width: 1024px) 440px, 100vw" className="object-cover" />
              </div>
            ) : (
              <div className="relative hidden aspect-square max-h-[22rem] items-center justify-center lg:flex">
                <BrandRings className="absolute inset-0 m-auto size-full text-lime/25" />
                <Logo variant="full-reversed" height={150} priority />
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl space-y-12 px-4 py-12">
        <section aria-labelledby="how">
          <h2 id="how" className="text-2xl font-bold tracking-tight text-primary">{S.howTitle}</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {S.steps.map((step, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <li key={step.title} className="flex gap-3 rounded-2xl border bg-card p-4 shadow-sm">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><Icon className="size-5" aria-hidden /></span>
                  <div>
                    <p className="font-semibold text-primary"><span className="tabular text-sage-ink">{i + 1}.</span> {step.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="packages">
          <h2 id="packages" className="text-2xl font-bold tracking-tight text-primary">{S.packagesTitle}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {S.packages.map((p) => (
              <div key={p.name} className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
                <div className="mb-3 h-1 w-10 rounded-full bg-lime" aria-hidden />
                <h3 className="text-lg font-bold text-primary">{p.name}</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {p.points.map((x) => (
                    <li key={x} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sage" aria-hidden />{x}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {actor ? null : (
            <Button asChild size="lg" className="mt-5 h-12 w-full px-6 text-base sm:w-auto">
              <Link href="/signup">{S.ctaSignup}</Link>
            </Button>
          )}
        </section>

        <section className="rounded-2xl border border-primary/10 bg-oat/60 p-5">
          <h2 className="font-bold text-primary">{S.payTitle}</h2>
          <p className="mt-1 text-sm">{S.payText}</p>
        </section>
      </div>

      <footer className="border-t bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <Logo variant="horizontal" height={24} />
          <p className="text-sm text-muted-foreground">{S.footer}</p>
        </div>
      </footer>
    </main>
  );
}
