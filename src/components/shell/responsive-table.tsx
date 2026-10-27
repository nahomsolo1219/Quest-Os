import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tables that become cards on phones (UI refresh item 12). Works in server and client components (no hooks).
 * - below `md`: one card per row. The first column is the card title; columns marked `card: "key"` (3–4 of them)
 *   show as label/value pairs; the rest go into a "More" disclosure (`card: "more"`, the default) or are left out
 *   (`card: "hide"`). `badge` columns sit next to the title. `rowClassName` also styles the sticky cell, so give
 *   it an opaque background (e.g. `bg-danger-soft`).
 * - `md` and up: a normal table; horizontal scroll stays inside the table box and the first column is sticky.
 */
export type RtColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** text shown in the card's label/value pair when it differs from `header` */
  cardLabel?: ReactNode;
  card?: "key" | "more" | "badge" | "hide";
  align?: "left" | "right";
  className?: string;
};

export function ResponsiveTable<T>({ rows, columns, rowKey, rowClassName, footer, cardFooter, minWidth = 640, label, moreLabel = "More", dense = false }: {
  rows: T[];
  columns: RtColumn<T>[];
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /** table footer row(s) (`<tr>`s), md+ only */
  footer?: ReactNode;
  /** summary shown under the cards, phones only */
  cardFooter?: ReactNode;
  minWidth?: number;
  /** accessible name for the table and card list */
  label?: string;
  moreLabel?: string;
  /** long lists: cards become rows of one bordered list instead of separate cards */
  dense?: boolean;
}) {
  const [first, ...rest] = columns;
  const keys = rest.filter((c) => c.card === "key");
  const badges = rest.filter((c) => c.card === "badge");
  const more = rest.filter((c) => (c.card ?? "more") === "more");
  return (
    <>
      <ul aria-label={label} className={cn("md:hidden", dense ? "divide-y rounded-xl border bg-card shadow-sm" : "space-y-2")}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={cn(dense ? "px-3 py-2" : "rounded-xl border bg-card p-3 shadow-sm", rowClassName?.(row))}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-semibold">{first.cell(row)}</div>
              {badges.length ? <div className="flex shrink-0 flex-col items-end gap-1">{badges.map((c) => <div key={c.key}>{c.cell(row)}</div>)}</div> : null}
            </div>
            {keys.length ? (
              <dl className={cn("grid gap-x-3 text-sm", dense ? "mt-1 grid-cols-[1fr_1.4fr_1.2fr_1fr] gap-y-1" : "mt-2 grid-cols-2 gap-y-1.5")}>
                {keys.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{c.cardLabel ?? c.header}</dt>
                    <dd className="font-medium tabular-nums">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {more.length ? (
              <details className="group mt-2 border-t pt-1">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
                  {moreLabel}<ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <dl className="grid grid-cols-1 gap-y-1.5 pb-1 text-sm">
                  {more.map((c) => (
                    <div key={c.key} className="flex flex-wrap justify-between gap-x-3">
                      <dt className="text-muted-foreground">{c.cardLabel ?? c.header}</dt>
                      <dd className="min-w-0 text-right">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
      {cardFooter ? <div className="mt-2 rounded-xl border bg-card p-3 text-sm font-semibold md:hidden">{cardFooter}</div> : null}

      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table aria-label={label} className="w-full text-sm" style={{ minWidth }}>
          <thead className="bg-muted text-left">
            <tr>
              {columns.map((c, i) => (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2 font-semibold", c.align === "right" && "text-right",
                  i === 0 && "sticky left-0 z-10 bg-muted shadow-[1px_0_0_var(--border)]")}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const extra = rowClassName?.(row);
              return (
                <tr key={rowKey(row)} className={cn("group/row border-t", extra)}>
                  {columns.map((c, i) => i === 0 ? (
                    <th key={c.key} scope="row" className={cn("sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium shadow-[1px_0_0_var(--border)]", extra, c.className)}>{c.cell(row)}</th>
                  ) : (
                    <td key={c.key} className={cn("px-3 py-2 align-top", c.align === "right" && "text-right tabular-nums", c.className)}>{c.cell(row)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer ? <tfoot>{footer}</tfoot> : null}
        </table>
      </div>
    </>
  );
}
