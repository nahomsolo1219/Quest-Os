import { describe, expect, it } from "vitest";
import { formatEthiopianPhone, normalizeEthiopianPhone } from "./phone";

describe("normalizeEthiopianPhone", () => {
  it.each([
    ["0911234567", "+251911234567"],
    ["0711234567", "+251711234567"],
    ["911234567", "+251911234567"],
    ["711234567", "+251711234567"],
    ["+251911234567", "+251911234567"],
    ["251911234567", "+251911234567"],
    ["00251911234567", "+251911234567"],
    ["+251 91 123 4567", "+251911234567"],
    ["091-123-4567", "+251911234567"],
    [" 09 11 23 45 67 ", "+251911234567"],
    ["(091) 123.4567", "+251911234567"],
    ["+251-71-123-4567", "+251711234567"],
  ])("%s -> %s", (input, out) => {
    expect(normalizeEthiopianPhone(input)).toBe(out);
  });

  it.each([
    "", "abc", "0811234567", "+251811234567", "09112345", "09112345678", "+1 415 555 0100", "+2510911234567",
    "1911234567", "0111234567", "+25191123456", "09a1234567",
  ])("rejects %s", (input) => {
    expect(normalizeEthiopianPhone(input)).toBeNull();
  });

  it("formats for display", () => {
    expect(formatEthiopianPhone("+251911234567")).toBe("+251 91 123 4567");
    expect(formatEthiopianPhone("weird")).toBe("weird");
  });
});
