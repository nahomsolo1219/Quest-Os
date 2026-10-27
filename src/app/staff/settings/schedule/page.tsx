import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/components/owner/settings-form";
import { serviceCtx } from "@/server/session";
import { readSettings } from "@/server/services/catalog";
import { saveScheduleAction } from "../actions";
import { SCHEDULE_FIELDS } from "../fields";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule settings" };

export default async function ScheduleSettingsPage() {
  const actor = await requireSettingsTab("settings.write");
  const s = await readSettings(await serviceCtx(actor));
  return (
    <div>
      <PageHeader title={S.tabs.schedule} description={S.scheduleIntro} />
      <SettingsForm settingsKey="schedule" value={s.schedule} groups={SCHEDULE_FIELDS} save={saveScheduleAction} tour="settings-schedule" />
    </div>
  );
}
