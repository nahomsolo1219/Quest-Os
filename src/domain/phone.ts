// Ethiopian mobile numbers, stored as E.164: +2519XXXXXXXX or +2517XXXXXXXX.

/**
 * Accepts 09…, 07…, 9…, 7…, +251…, 251…, 00251…, with spaces, dashes, dots or brackets.
 * Returns +2519XXXXXXXX / +2517XXXXXXXX, or null when the input is not an Ethiopian mobile number.
 */
export function normalizeEthiopianPhone(input: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!/^\+?[\d\s\-.()]+$/.test(trimmed)) return null;
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (hasPlus) {
    if (!digits.startsWith("251")) return null;
    digits = digits.slice(3);
  } else if (digits.startsWith("00251")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("251") && digits.length === 12) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0") && digits.length === 10) {
    digits = digits.slice(1);
  }
  if (!/^[79]\d{8}$/.test(digits)) return null;
  return `+251${digits}`;
}

/** "+251 91 123 4567" for display. */
export function formatEthiopianPhone(e164: string): string {
  const m = /^\+251(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+251 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
