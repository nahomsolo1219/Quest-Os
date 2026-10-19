import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/components/owner/settings-form";
import { serviceCtx } from "@/server/session";
import { readSettings } from "@/server/services/catalog";
import { saveNutritionSettingsAction } from "../actions";
import { NUTRITION_FIELDS } from "../fields";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nutrition settings" };

export default async function NutritionSettingsPage() {
  const actor = await requireSettingsTab("settings.nutrition.write");
  const s = await readSettings(await serviceCtx(actor));
  return (
    <div>
      <PageHeader title={S.tabs.nutrition} description={S.nutritionIntro} />
      <SettingsForm settingsKey="nutrition" value={s.nutrition} groups={NUTRITION_FIELDS} save={saveNutritionSettingsAction} extraCheck="macroSplit" />
    </div>
  );
}
