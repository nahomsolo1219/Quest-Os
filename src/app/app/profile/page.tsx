import { PageHeader } from "@/components/shell/page-header";
import { BackToPlan } from "@/components/client/plan-links";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { AddressForm, PasswordForm, TelegramConnect } from "@/components/client/profile-forms";
import { requirePageActor, serviceCtx } from "@/server/session";
import { myProfile } from "@/server/services/client-app";
import { telegramStatus } from "@/server/services/notifications";
import { formatEthiopianPhone } from "@/domain/phone";
import { formatDate } from "@/domain/time";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const actor = await requirePageActor("client");
  const ctx = await serviceCtx(actor);
  const [p, tg] = await Promise.all([myProfile(ctx), telegramStatus(ctx)]);
  return (
    <div className="space-y-4">
      <div>
        <BackToPlan />
        <PageHeader title={T.profile.title} description={`${p.firstName} ${p.lastName} · ${formatEthiopianPhone(p.phone)}`} />
      </div>
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-semibold">{T.profile.address}</h2>
        <AddressForm initial={{ address: p.address, areaId: p.areaId, landmark: p.landmark, telegramOptIn: p.telegramOptIn }} areas={p.areas}
          effectiveLabel={formatDate(p.effectiveWeek, "long")} />
      </section>
      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-semibold">{T.profile.telegram}</h2>
        <p className="text-sm text-muted-foreground">{T.profile.telegramHint}</p>
        <TelegramConnect linked={tg.linked} configured={tg.configured && Boolean(process.env.TELEGRAM_BOT_USERNAME)} />
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-semibold">{T.profile.password}</h2>
        <PasswordForm />
      </section>
      <section className="space-y-2">
        <h2 className="sr-only">{T.profile.account}</h2>
        <SignOutButton />
      </section>
    </div>
  );
}
