import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/domain/contrast";
import { BRAND, TEXT_PAIRS } from "./brand";

describe("brand palette", () => {
  it("keeps the guideline hexes", () => {
    expect(BRAND).toEqual({
      deepForest: "#11301A", freshLime: "#8BC53F", morningMist: "#F3F9EB", oat: "#E4DFD0",
      charcoal: "#2E3830", sage: "#7F9473", tangerine: "#F28C28",
    });
  });

  it.each(TEXT_PAIRS)("%s passes AA (≥ 4.5:1)", (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
