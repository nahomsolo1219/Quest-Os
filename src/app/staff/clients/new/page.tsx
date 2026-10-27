import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { LeadForm } from "@/components/ops/lead-form";
import { requirePageActor } from "@/server/session";
import { S } from "../strings";

export default async function NewLeadPage() {
  await requirePageActor("owner", "operations");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={S.newTitle} description={S.newDescription} />
      <Card data-tour="newclient-form"><CardContent className="pt-6"><LeadForm /></CardContent></Card>
    </div>
  );
}
