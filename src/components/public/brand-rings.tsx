/**
 * Decorative concentric rings echoing the ring of the Quest mark (pure SVG, colour from `currentColor`).
 * It is a background motif, not the logo, so the logo itself is never recoloured or faded.
 */
export function BrandRings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden focusable="false" className={className}>
      <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="2" />
      <circle cx="100" cy="100" r="76" stroke="currentColor" strokeWidth="6" />
      <circle cx="100" cy="100" r="54" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
