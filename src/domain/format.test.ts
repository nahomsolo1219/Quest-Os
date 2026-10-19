import { describe, expect, it } from "vitest";
import { displayName, profileLabel, signed } from "./format";

describe("format", () => {
  it("shows first name and last initial", () => {
    expect(displayName("Dagi", "Kebede")).toBe("Dagi K.");
    expect(displayName(" Kidus ", " alemu")).toBe("Kidus A.");
    expect(displayName("Hana", "")).toBe("Hana");
    expect(displayName("Selam", "Ãbebe")).toBe("Selam Ã.");
  });
  it("labels profiles", () => {
    expect(profileLabel("M_LEAN")).toBe("M-Lean");
    expect(profileLabel("L_BUILD")).toBe("L-Build");
  });
  it("uses a real minus sign", () => {
    expect(signed(-3.2)).toBe("−3.2");
    expect(signed(1)).toBe("+1.0");
    expect(signed(0)).toBe("0.0");
    expect(signed(-0.04)).toBe("0.0");
  });
});
