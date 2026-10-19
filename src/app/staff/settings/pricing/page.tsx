import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/components/owner/settings-form";
import { serviceCtx } from "@/server/session";
import { readSettings } from "@/server/services/catalog";
import { savePricingAction } from "../actions";
import { PRICING_FIELDS } from "../fields";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing settings" };

export default async function PricingSettingsPage() {
  const actor = await requireSettingsTab("pricing.write");
  const s = await readSettings(await serviceCtx(actor));
  // weekly delivery cannot be enabled while food must be eaten within 3 days (updateSettings enforces it too)
  const groups = PRICING_FIELDS.map((g) => ({ ...g, fields: g.fields.map((f) => f.path !== "enabledDeliveryOptions" ? f
    : { ...f, options: f.options!.map((o) => ({ ...o, disabled: o.value === "weekly" && s.schedule.freshnessDays <= 3 && !s.pricing.enabledDeliveryOptions.includes("weekly") })) }) }));
  return (
    <div>
      <PageHeader title={S.tabs.pricing} description={S.pricingIntro} />
      <SettingsForm settingsKey="pricing" value={s.pricing} groups={groups} save={savePricingAction} />
    </div>
  );
}
