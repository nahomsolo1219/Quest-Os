/** Slim Fresh-Lime bar on every page of the demo copy (rendered only when DEMO_MODE=true). */
export function DemoBanner({ realUrl }: { realUrl: string | null }) {
  return (
    <div role="note" data-demo-banner className="no-print relative z-40 bg-lime px-4 py-1.5 text-center text-sm font-medium text-forest">
      Demo copy. Practice freely: data is fake and resets every night.
      {realUrl ? <> <a href={realUrl} className="ml-1 font-semibold underline underline-offset-2">Go to the real app</a></> : null}
    </div>
  );
}
