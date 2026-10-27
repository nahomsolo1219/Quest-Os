// Quest brand palette (docs/brand guideline) and the text pairs the UI uses.
// Mirrors the tokens in src/app/globals.css; src/lib/brand.test.ts proves each pair passes WCAG AA.

export const BRAND = {
  deepForest: "#11301A",
  freshLime: "#8BC53F",
  morningMist: "#F3F9EB",
  oat: "#E4DFD0",
  charcoal: "#2E3830",
  sage: "#7F9473",
  tangerine: "#F28C28",
} as const;

export const TOKENS = {
  white: "#FFFFFF",
  sageInk: "#56664D",
  accent: "#E4F1D2",
  muted: "#EBF2E1",
  destructive: "#B42318",
  success: "#1E6B30",
  successSoft: "#E3F2D9",
  warning: "#8A4A00",
  warningSoft: "#FDF0D4",
  danger: "#A3201B",
  dangerSoft: "#FCE5E3",
  paused: "#4F5F46",
  sidebarMuted: "#B7C9AC",
  darkBackground: "#0C1F11",
  darkCard: "#15291A",
  darkMuted: "#A9B89F",
} as const;

/** [name, foreground, background] for every text pair in the light and dark themes. */
export const TEXT_PAIRS: [string, string, string][] = [
  ["body text on Mist", BRAND.charcoal, BRAND.morningMist],
  ["body text on card", BRAND.charcoal, TOKENS.white],
  ["muted text on Mist", TOKENS.sageInk, BRAND.morningMist],
  ["muted text on card", TOKENS.sageInk, TOKENS.white],
  ["muted text on muted", TOKENS.sageInk, TOKENS.muted],
  ["heading on Mist", BRAND.deepForest, BRAND.morningMist],
  ["white on primary", TOKENS.white, BRAND.deepForest],
  ["accent text", BRAND.deepForest, TOKENS.accent],
  ["white on destructive", TOKENS.white, TOKENS.destructive],
  ["Lime on Deep Forest (sidebar active)", BRAND.freshLime, BRAND.deepForest],
  ["Deep Forest on Lime", BRAND.deepForest, BRAND.freshLime],
  ["sidebar text", BRAND.morningMist, BRAND.deepForest],
  ["sidebar muted text", TOKENS.sidebarMuted, BRAND.deepForest],
  ["promo text on Tangerine", BRAND.deepForest, BRAND.tangerine],
  ["status good", TOKENS.success, TOKENS.successSoft],
  ["status warn", TOKENS.warning, TOKENS.warningSoft],
  ["status bad", TOKENS.danger, TOKENS.dangerSoft],
  ["status paused", TOKENS.paused, BRAND.oat],
  ["good text on card", TOKENS.success, TOKENS.white],
  ["warn text on card", TOKENS.warning, TOKENS.white],
  ["bad text on card", TOKENS.danger, TOKENS.white],
  ["dark body text", BRAND.morningMist, TOKENS.darkBackground],
  ["dark card text", BRAND.morningMist, TOKENS.darkCard],
  ["dark muted text", TOKENS.darkMuted, TOKENS.darkBackground],
  ["dark primary text", BRAND.freshLime, TOKENS.darkCard],
];
