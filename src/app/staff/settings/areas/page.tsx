import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { AreasEditor } from "@/components/owner/areas-editor";
import { serviceCtx } from "@/server/session";
import { listAreas } from "@/server/services/catalog";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Areas" };

export default async function AreasPage() {
  const actor = await requireSettingsTab("areas.write");
  const areas = await listAreas(await serviceCtx(actor));
  return (
    <div className="max-w-2xl">
      <PageHeader title={S.tabs.areas} description={S.areasIntro} />
      <Card><CardContent className="pt-6"><AreasEditor areas={areas.map((a) => ({ id: a.id, name: a.name, active: a.active }))} /></CardContent></Card>
    </div>
  );
}
