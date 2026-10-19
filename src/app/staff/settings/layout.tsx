import { TabNav } from "@/components/owner/tab-nav";
import { requirePageActor } from "@/server/session";
import { S } from "./strings";
import { tabsFor } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  return (
    <div>
      <TabNav items={tabsFor(actor)} label={S.title} />
      {children}
    </div>
  );
}
