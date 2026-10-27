import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Quest logo from the brand guideline (public/brand). Full colour on light backgrounds,
 * reversed (lime + white) on Deep Forest. Never recolour, stretch or add effects;
 * keep clear space of one mark height around it (callers give it room).
 */
const FILES = {
  full: { src: "/brand/logo-full.svg", w: 148, h: 118, alt: "Quest Meals" },
  "full-reversed": { src: "/brand/logo-full-reversed.svg", w: 148, h: 118, alt: "Quest Meals" },
  horizontal: { src: "/brand/logo-horizontal.svg", w: 149, h: 46, alt: "Quest Meals" },
  "horizontal-reversed": { src: "/brand/logo-horizontal-reversed.svg", w: 149, h: 46, alt: "Quest Meals" },
  mark: { src: "/brand/logo-mark.svg", w: 56, h: 56, alt: "Quest Meals" },
} as const;

export type LogoVariant = keyof typeof FILES;

export function Logo({ variant = "horizontal", height = 28, className, priority }: {
  variant?: LogoVariant; height?: number; className?: string; priority?: boolean;
}) {
  const f = FILES[variant];
  const width = Math.round((f.w / f.h) * height);
  return <Image src={f.src} alt={f.alt} width={width} height={height} priority={priority} unoptimized className={cn("block select-none", className)} style={{ height, width }} />;
}
