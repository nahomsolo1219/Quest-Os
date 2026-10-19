import { describe, expect, it } from "vitest";
import { BRAND_TEXT_PAIRS, contrastRatio, relativeLuminance } from "./contrast";

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFF", "#FFF")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 6);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(() => contrastRatio("#12", "#fff")).toThrow();
  });

  it.each(BRAND_TEXT_PAIRS)("%s passes AA (≥ 4.5:1)", (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
