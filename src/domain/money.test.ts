import { describe, expect, it } from "vitest";
import { ceilTo, floorTo, formatBirr, roundDecimals, roundToNearest } from "./money";

describe("money", () => {
  it("formats whole birr with en-US grouping", () => {
    expect(formatBirr(58400)).toBe("58,400 ETB");
    expect(formatBirr(0)).toBe("0 ETB");
    expect(formatBirr(950)).toBe("950 ETB");
    expect(formatBirr(1234567)).toBe("1,234,567 ETB");
    expect(formatBirr(2246.4)).toBe("2,246 ETB");
    expect(formatBirr(-1500)).toBe("-1,500 ETB");
  });

  it("rounds to the nearest step, halves up", () => {
    expect(roundToNearest(58396.3, 100)).toBe(58400);
    expect(roundToNearest(54062.96, 100)).toBe(54100);
    expect(roundToNearest(58350, 100)).toBe(58400);
    expect(roundToNearest(58349.99, 100)).toBe(58300);
    expect(roundToNearest(13476.92, 10)).toBe(13480);
    expect(roundToNearest(12.5, 5)).toBe(15);
    expect(roundToNearest(12.4, 5)).toBe(10);
    expect(() => roundToNearest(1, 0)).toThrow();
  });

  it("ceils and floors to a step ignoring float noise", () => {
    expect(ceilTo(122.22, 10)).toBe(130);
    expect(ceilTo(120, 10)).toBe(120);
    expect(ceilTo(110.00000000001, 10)).toBe(110);
    expect(ceilTo(1.01, 0.1)).toBeCloseTo(1.1, 10);
    expect(floorTo(129.9, 10)).toBe(120);
    expect(roundDecimals(0.1 + 0.2, 2)).toBe(0.3);
    expect(roundDecimals(-3.25, 1)).toBe(-3.3);
  });
});
