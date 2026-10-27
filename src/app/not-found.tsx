import { MessageScreen } from "@/components/shell/error-screen";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return <main><MessageScreen showLogo title="Page not found" body="This page does not exist or was moved." homeHref="/" homeLabel="Go to the home page" /></main>;
}
