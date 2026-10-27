"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, equalsFilter } from "@/components/shell/data-table";
import { Button } from "@/components/ui/button";
import { formatEthiopianPhone } from "@/domain/phone";
import { ClientStatusBadge, PaymentBadge, ToneBadge } from "./badges";
import { DELIVERY_LABEL } from "./labels";
import type { ClientListRow } from "@/server/services/clients";
import { S } from "@/app/staff/clients/strings";

const columns: ColumnDef<ClientListRow, unknown>[] = [
  // the name column also carries both phone spellings so the search box finds 0911… and +251911…
  { id: "name", accessorFn: (r) => `${r.name} 0${r.phone.slice(4)} ${r.phone}`, header: S.colName, cell: ({ row }) => (
    // a real link too, so the guided tour can follow "open a client" (first active client)
    <Link href={`/staff/clients/${row.original.id}`} onClick={(e) => e.stopPropagation()} data-tour={row.original.status === "active" ? "clients-first-row" : undefined}
      className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline">{row.original.name}</Link>
  ) },
  { accessorKey: "status", header: S.colStatus, cell: ({ row }) => <ClientStatusBadge status={row.original.status} />, filterFn: equalsFilter },
  { accessorKey: "payment", header: S.colPayment, cell: ({ row }) => <PaymentBadge state={row.original.payment} />, filterFn: equalsFilter },
  { id: "plan", accessorFn: (r) => r.packageName ?? "—", header: S.colPlan, filterFn: equalsFilter,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.packageName ?? "—"}{row.original.quickStart ? <ToneBadge tone="info" className="ml-1">Quick start</ToneBadge> : null}</span> },
  { id: "area", accessorFn: (r) => r.areaName ?? "—", header: S.colArea, filterFn: equalsFilter },
  { accessorKey: "phone", header: S.colPhone, cell: ({ row }) => <span className="whitespace-nowrap">{formatEthiopianPhone(row.original.phone)}</span>, enableGlobalFilter: false },
  { id: "delivery", accessorFn: (r) => (r.deliveryOption ? DELIVERY_LABEL[r.deliveryOption] : "—"), header: S.colDelivery, enableGlobalFilter: false },
  { accessorKey: "profile", header: S.colProfile, enableGlobalFilter: false,
    cell: ({ row }) => row.original.profile ? <span className="whitespace-nowrap">{row.original.profile}{row.original.provisional ? <span className="ml-1 text-xs text-warning">({S.provisional})</span> : null}</span> : "—" },
];

export function ClientsTable({ rows, areas, plans }: { rows: ClientListRow[]; areas: string[]; plans: string[] }) {
  return (
    // white table on Mist (DataTable is lead-owned; style its scroll box from here)
    <div className="[&_.overflow-x-auto]:bg-card [&_select]:bg-card [&_input]:bg-card">
    <DataTable
      data={rows}
      columns={columns}
      searchPlaceholder={S.search}
      searchTour="clients-search"
      onRowHref={(r) => `/staff/clients/${r.id}`}
      filters={[
        { columnId: "status", label: S.filterStatus, options: [["lead", "Lead"], ["active", "Active"], ["paused", "Paused"], ["ended", "Ended"]].map(([value, label]) => ({ value, label })) },
        { columnId: "plan", label: S.filterPlan, options: plans.map((p) => ({ value: p, label: p })) },
        { columnId: "area", label: S.filterArea, options: areas.map((a) => ({ value: a, label: a })) },
        { columnId: "payment", label: S.filterPayment, options: [["paid", "Paid"], ["due", "Due"], ["overdue", "Overdue"], ["none", "No invoice"]].map(([value, label]) => ({ value, label })) },
      ]}
      empty={{ title: S.emptyTitle, body: S.emptyBody, action: <Button asChild className="h-11"><Link href="/staff/clients/new">{S.addLead}</Link></Button> }}
    />
    </div>
  );
}
