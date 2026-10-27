import { UnderlineTabNav } from "@/components/shell/underline-tabs";
import { requirePageActor } from "@/server/session";
import { S } from "./strings";

export default async function NutritionLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const items = [
    { href: "/staff/nutrition", label: S.tabs.queue, exact: true },
    { href: "/staff/nutrition/profiles", label: S.tabs.profiles },
    ...(actor.roles.some((r) => r === "owner" || r === "nutritionist") ? [{ href: "/staff/nutrition/swaps", label: S.tabs.swaps }] : []),
    { href: "/staff/nutrition/checkins", label: S.tabs.checkins },
  ];
  return (
    <div>
      <UnderlineTabNav items={items} label={S.title} />
      {children}
    </div>
  );
}
