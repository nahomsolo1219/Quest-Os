import { PageSkeleton } from "@/components/shell/page-skeleton";

// Only on the area's home page (route group), never above other pages: in Next 15.5 any loading
// boundary over a page stops same-page ?param links (day strip, week switch, tabs) from navigating
// in the production build (D515).
export default function Loading() {
  return <PageSkeleton />;
}
