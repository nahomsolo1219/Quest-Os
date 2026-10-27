import { PageSkeleton } from "@/components/shell/page-skeleton";

// Page-level (not area-level) on purpose: an area-level loading boundary stops same-page
// ?param links (day strip, week switch, tabs) from navigating in the production build (D513).
export default function Loading() {
  return <PageSkeleton />;
}
