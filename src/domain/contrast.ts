// WCAG 2.x contrast ratio, used to prove the brand palette passes AA (4.5:1 for body text).

export const BRAND_COLORS = {
  accent: "#C2410C",
  onAccent: "#FFFFFF",
  text: "#171717",
  background: "#FFFFFF",
  mutedText: "#525252",
  darkText: "#FAFAFA",
  darkBackground: "#0A0A0A",
  darkAccent: "#FB923C",
} as const;

/** Pairs [foreground, background] the UI uses for text. */
export const BRAND_TEXT_PAIRS: [string, string, string][] = [
  ["accent on white", BRAND_COLORS.accent, BRAND_COLORS.background],
  ["white on accent", BRAND_COLORS.onAccent, BRAND_COLORS.accent],
  ["body text", BRAND_COLORS.text, BRAND_COLORS.background],
  ["muted text", BRAND_COLORS.mutedText, BRAND_COLORS.background],
  ["dark body text", BRAND_COLORS.darkText, BRAND_COLORS.darkBackground],
  ["dark accent", BRAND_COLORS.darkAccent, BRAND_COLORS.darkBackground],
];

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex colour "${hex}"`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
