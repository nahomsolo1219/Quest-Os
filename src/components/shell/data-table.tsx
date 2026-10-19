"use client";

import { useState, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnFiltersState, type SortingState,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "./empty-state";

export type FilterDef = { columnId: string; label: string; options: { value: string; label: string }[] };

/**
 * Staff list table (TanStack Table): search box, select filters, sortable headers.
 * Define `columns` in a client component next to the page that uses it.
 */
export function DataTable<T>({ data, columns, filters = [], searchPlaceholder = "Search", empty, onRowHref }: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  filters?: FilterDef[];
  searchPlaceholder?: string;
  empty: { title: string; body?: ReactNode; action?: ReactNode };
  onRowHref?: (row: T) => string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const table = useReactTable({
    data, columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (data.length === 0) return <EmptyState title={empty.title} action={empty.action}>{empty.body}</EmptyState>;

  const rows = table.getRowModel().rows;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="table-search">{searchPlaceholder}</label>
        <Input id="table-search" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder} className="h-11 w-full sm:w-64" />
        {filters.map((f) => {
          const col = table.getColumn(f.columnId);
          const id = `filter-${f.columnId}`;
          return (
            <div key={f.columnId}>
              <label className="sr-only" htmlFor={id}>{f.label}</label>
              <select id={id} className="h-11 rounded-md border bg-background px-3 text-sm"
                value={(col?.getFilterValue() as string) ?? ""}
                onChange={(e) => col?.setFilterValue(e.target.value || undefined)}>
                <option value="">{f.label}: all</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="whitespace-nowrap">
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button type="button" className="min-h-11 min-w-11 font-semibold" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="p-6 text-center text-muted-foreground">No rows match these filters. Clear the search or filters.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className={onRowHref ? "cursor-pointer" : undefined}
                onClick={onRowHref ? () => { window.location.href = onRowHref(r.original); } : undefined}>
                {r.getVisibleCells().map((c) => <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{rows.length} of {data.length}</p>
    </div>
  );
}

/** Exact-match filter for select filters. */
export const equalsFilter = (row: { getValue: (id: string) => unknown }, id: string, value: string) => String(row.getValue(id)) === value;
