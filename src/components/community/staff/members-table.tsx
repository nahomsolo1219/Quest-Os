"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shell/data-table";
import { T } from "@/app/staff/community/strings";
import { MuteButton, UnmuteButton } from "./moderation-buttons";

export type MemberRow = { userId: string; name: string; status: "active" | "paused" | "ended" | "lead"; access: keyof typeof T.access; mutedLabel: string | null; muteReason: string | null };

const columns: ColumnDef<MemberRow, unknown>[] = [
  { accessorKey: "name", header: "Member", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
  { accessorKey: "status", header: "Plan", filterFn: "equals", cell: ({ row }) => T.status[row.original.status] },
  { accessorKey: "access", header: "Community", cell: ({ row }) => <Badge variant={row.original.access === "full" ? "default" : "secondary"}>{T.access[row.original.access]}</Badge> },
  {
    id: "mute", header: "Mute", enableSorting: false,
    cell: ({ row }) => row.original.mutedLabel ? (
      <div className="flex min-w-48 flex-wrap items-center gap-2">
        <span className="text-xs">{T.mutedUntil(row.original.mutedLabel)}{row.original.muteReason ? ` (${row.original.muteReason})` : ""}</span>
        <UnmuteButton userId={row.original.userId} />
      </div>
    ) : <MuteButton userId={row.original.userId} name={row.original.name} />,
  },
];

export function MembersTable({ rows }: { rows: MemberRow[] }) {
  return (
    <DataTable data={rows} columns={columns} searchPlaceholder="Search members"
      filters={[{ columnId: "status", label: "Plan", options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "ended", label: "Ended" }] }]}
      empty={{ title: T.membersEmpty, body: T.membersEmptyBody }} />
  );
}
