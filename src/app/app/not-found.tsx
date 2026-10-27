import { MessageScreen } from "@/components/shell/error-screen";

export default function NotFound() {
  return <MessageScreen title="Page not found" body="This page does not exist or was moved." homeHref="/app" homeLabel="Back to Today" />;
}
