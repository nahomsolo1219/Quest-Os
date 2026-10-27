import { UnderlineTabNav } from "@/components/shell/underline-tabs";
import { requirePageActor } from "@/server/session";
import { S } from "./strings";
import { tabsFor } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  return (
    <div>
      <div data-tour="settings-tabs"><UnderlineTabNav items={tabsFor(actor)} label={S.title} /></div>
      {children}
    </div>
  );
}
