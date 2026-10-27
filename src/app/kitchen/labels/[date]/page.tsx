import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PrintButton } from "@/components/kitchen/print-button";
import { SheetNav } from "@/components/kitchen/sheet-nav";
import { SLOT_LABEL } from "@/components/kitchen/format";
import { formatDate } from "@/domain/time";
import { requirePageActor, serviceCtx } from "@/server/session";
import { labelsForDate } from "@/server/services/kitchen";
import { cookDateParam } from "../../params";
import { S } from "../../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Labels" };

export default async function LabelsPage({ params }: { params: Promise<{ date: string }> }) {
  const date = await cookDateParam(params);
  const actor = await requirePageActor("owner", "operations", "kitchen");
  const list = await labelsForDate(await serviceCtx(actor), date);

  return (
    <div className="mx-auto max-w-5xl">
      <SheetNav date={date} current="labels" />
      <PageHeader title={`${S.labels} · ${formatDate(date, "long")}`}
        description={list.length ? `${list.length} labels · A4, 3 across. Print at 100% scale.` : undefined}
        actions={list.length ? <PrintButton label="Print labels" tour="labels-print" /> : null} />
      {list.length === 0 ? <EmptyState title={S.emptyDay}>{S.emptyDayBody}</EmptyState> : (
        <div className="label-sheet grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((l, i) => (
            <div key={`${l.clientId}|${l.serviceDate}|${l.slot}|${i}`} className="flex flex-col rounded-md border p-2 text-[13px] leading-tight print:rounded-none print:text-[8.5pt]">
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-base font-extrabold print:text-[11pt]">{l.name}</span>
                <span className="shrink-0 font-semibold">{l.profileLabel}</span>
              </div>
              <p className="truncate font-semibold">{l.mealName}</p>
              <p>{SLOT_LABEL[l.slot]}{l.serviceDate !== l.cookDate ? ` · for ${formatDate(l.serviceDate)}` : ""}</p>
              <p className="tabular-nums">{l.kcal} kcal · P {l.proteinG} g · C {l.carbG} g · F {l.fatG} g</p>
              <p>Cooked {formatDate(l.cookDate)} · <span className="font-bold">Eat by {formatDate(l.eatBy)}</span></p>
              {l.allergyNote ? <p className="truncate font-bold text-danger print:text-black">{l.allergyNote}</p> : null}
              <p className="mt-auto italic">{l.reheat}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
