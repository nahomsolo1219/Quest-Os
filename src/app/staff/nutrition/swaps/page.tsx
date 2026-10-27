import Link from "next/link";
import { StatusBadge } from "@/components/shell/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { SwapDecision } from "@/components/nutrition/swap-decision";
import { requirePageActor, serviceCtx } from "@/server/session";
import { swapApprovals } from "@/server/services/nutrition";
import { displayName } from "@/domain/format";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Swap approvals" };

export default async function SwapApprovalsPage() {
  const actor = await requirePageActor("owner", "nutritionist");
  const d = await swapApprovals(await serviceCtx(actor));
  return (
    <div className="space-y-4">
      <PageHeader title={S.tabs.swaps} description={`${S.swapsIntro} Next open week: ${formatDate(d.effectiveWeek, "long")}.`} />
      {d.requests.length === 0 ? <EmptyState title={S.swapsEmptyTitle}>{S.swapsEmptyBody}</EmptyState> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {d.requests.map((r) => {
            const over = r.swapLimit != null && r.standing >= r.swapLimit;
            return (
              <Card key={r.s.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/staff/nutrition/clients/${r.s.clientId}`} className="hover:text-primary">{displayName(r.firstName, r.lastName)}</Link>
                    <StatusBadge tone={over ? "warn" : "info"}>
                      {r.swapLimit != null ? `${r.standing} of ${r.swapLimit} swaps used` : "No active plan"}
                    </StatusBadge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-base font-medium">{r.ruleLabel ?? r.s.customRequest ?? "Custom request"}</p>
                  {r.ruleLabel && r.s.customRequest ? <p className="text-sm">“{r.s.customRequest}”</p> : null}
                  <p className="text-sm text-muted-foreground">
                    {r.ruleLabel ? "Swap-table swap beyond the plan limit" : "Outside the swap table"} · requested {formatAddisDateTime(r.s.createdAt)}
                    {r.requestedBy ? ` by ${r.requestedBy}` : ""} · from {formatDate(r.s.effectiveWeekStart)}
                  </p>
                  {r.allergies.length || r.dislikes.length ? (
                    <p className="text-sm text-danger">Allergies: {r.allergies.join(", ") || "none"} · Dislikes: {r.dislikes.join(", ") || "none"}</p>
                  ) : null}
                  <SwapDecision id={r.s.id} isCustom={!r.s.swapRuleId} rules={d.rules} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
