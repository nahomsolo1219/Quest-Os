import { redirect } from "next/navigation";
import { requirePageActor } from "@/server/session";
import { tabsFor } from "./tabs";

export const dynamic = "force-dynamic";

export default async function SettingsIndex() {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const first = tabsFor(actor)[0];
  redirect(first ? first.href : "/staff");
}
