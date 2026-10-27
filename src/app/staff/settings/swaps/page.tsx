import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { NewSwapRule, SwapRuleRow } from "@/components/owner/swap-rules";
import { serviceCtx } from "@/server/session";
import { listSwapRules } from "@/server/services/catalog";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Swap table" };

export default async function SwapTablePage() {
  const actor = await requireSettingsTab("swapRules.write");
  const t = await listSwapRules(await serviceCtx(actor));
  return (
    <div className="space-y-4">
      <PageHeader title={S.tabs.swaps} description={S.swapsIntro} />
      {t.rules.length === 0 ? <EmptyState title="The swap table is empty.">Add the first rule below.</EmptyState> : (
        <div className="space-y-3">{t.rules.map((r, i) => <div key={r.id} data-tour={i === 0 ? "settings-swaps" : undefined}><SwapRuleRow rule={r} canEdit={t.canEdit} /></div>)}</div>
      )}
      {t.canEdit ? (
        <Card>
          <CardHeader><CardTitle>Add a swap rule</CardTitle></CardHeader>
          <CardContent><NewSwapRule ingredients={t.ingredients.filter((i) => !i.isSeasoning)} meals={t.meals} /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
