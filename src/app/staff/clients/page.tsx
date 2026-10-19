import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ClientsTable } from "@/components/ops/clients-table";
import { requirePageActor, serviceCtx } from "@/server/session";
import { listAreas, listClients } from "@/server/services/clients";
import { can } from "@/server/authz";
import { S } from "./strings";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  const ctx = await serviceCtx(actor);
  const [rows, areas] = await Promise.all([listClients(ctx), listAreas(ctx)]);
  const plans = [...new Set(rows.map((r) => r.packageName).filter((p): p is string => Boolean(p)))].sort();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={S.listTitle} description={S.listDescription}
        actions={can(actor, "clients.createLead") ? <Button asChild className="h-11"><Link href="/staff/clients/new">{S.addLead}</Link></Button> : null} />
      <ClientsTable rows={rows} areas={areas.map((a) => a.name)} plans={plans} />
    </div>
  );
}
