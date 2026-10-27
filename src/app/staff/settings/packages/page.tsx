import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PackageForm } from "@/components/owner/package-form";
import { serviceCtx } from "@/server/session";
import { listPackages, readSettings } from "@/server/services/catalog";
import { DELIVERY_LABELS } from "../fields";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Packages" };

export default async function PackagesPage() {
  const actor = await requireSettingsTab("packages.write");
  const ctx = await serviceCtx(actor);
  const [pkgs, settings] = await Promise.all([listPackages(ctx), readSettings(ctx)]);
  return (
    <div>
      <PageHeader title={S.tabs.packages} description={S.packagesIntro} />
      {pkgs.length === 0 ? <EmptyState title="No packages yet.">Run the reference seed to add Essential, Performance and Premium.</EmptyState> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {pkgs.map((p, i) => (
            <Card key={p.id}>
              <CardHeader data-tour={i === 0 ? "settings-packages" : undefined}><CardTitle className="flex items-center justify-between">{p.name}{p.active ? null : <Badge variant="outline">Not offered</Badge>}</CardTitle></CardHeader>
              <CardContent>
                <PackageForm id={p.id} labels={DELIVERY_LABELS} enabled={settings.pricing.enabledDeliveryOptions}
                  values={{ name: p.name, swapLimit: p.swapLimit, checkinIntervalDays: p.checkinIntervalDays, coaching: p.coaching, deliveryOptions: p.deliveryOptions,
                    serviceFeeMonthBirr: p.serviceFeeMonthBirr, prioritySlot: p.prioritySlot, active: p.active }} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
