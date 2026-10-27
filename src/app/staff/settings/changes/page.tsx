import Link from "next/link";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { serviceCtx } from "@/server/session";
import { changeLog, CHANGE_LOG_ENTITIES, type ChangeLogEntity } from "@/server/services/catalog";
import { formatAddisDateTime } from "@/domain/time";
import { cn } from "@/lib/utils";
import { requireSettingsTab } from "../guard";
import { S } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Change log" };

const FILTERS: { value: ChangeLogEntity | ""; label: string }[] = [
  { value: "", label: "All settings" }, { value: "settings", label: "Settings" }, { value: "ingredients", label: "Prices & ingredients" },
  { value: "packages", label: "Packages" }, { value: "swap_rules", label: "Swap rules" }, { value: "areas", label: "Areas" }, { value: "nutrition_profiles", label: "Nutrition targets" },
];

/** Shows only the fields that changed between before and after. */
function diff(before: unknown, after: unknown): { key: string; from: string; to: string }[] {
  const flat = (o: unknown, prefix = ""): Record<string, string> => {
    if (o === null || o === undefined || typeof o !== "object" || Array.isArray(o)) return prefix ? { [prefix]: JSON.stringify(o ?? null) } : {};
    return Object.entries(o as Record<string, unknown>).reduce((acc, [k, v]) => ({ ...acc, ...flat(v, prefix ? `${prefix}.${k}` : k) }), {} as Record<string, string>);
  };
  const b = flat(before), a = flat(after);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => b[k] !== a[k]).map((k) => ({ key: k, from: b[k] ?? "–", to: a[k] ?? "–" }));
}

export default async function ChangeLogPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const actor = await requireSettingsTab("audit.read");
  const { entity } = await searchParams;
  const e = (CHANGE_LOG_ENTITIES as readonly string[]).includes(entity ?? "") ? (entity as ChangeLogEntity) : undefined;
  const rows = await changeLog(await serviceCtx(actor), { entity: e });
  return (
    <div>
      <PageHeader title={S.tabs.changes} description={S.changesIntro} />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.value} href={f.value ? `/staff/settings/changes?entity=${f.value}` : "/staff/settings/changes"}
            className={cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm", (e ?? "") === f.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{f.label}</Link>
        ))}
      </nav>
      {rows.length === 0 ? <EmptyState title="No changes logged yet.">Every saved change to settings, prices, packages and swap rules appears here.</EmptyState> : (
        <ol className="space-y-3">
          {rows.map(({ a, actorName }) => {
            const changes = diff(a.before, a.after);
            return (
              <li key={a.id} className="rounded-xl border p-3 bg-card">
                <p className="text-sm"><span className="font-semibold">{a.action}</span> · {a.entity} <span className="text-muted-foreground">{a.entityId}</span></p>
                <p className="text-xs text-muted-foreground">{formatAddisDateTime(a.createdAt)} · {actorName ?? "Automatic"}{a.reason ? ` · “${a.reason}”` : ""}</p>
                {changes.length ? (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {changes.slice(0, 12).map((c) => (
                      <li key={c.key} className="break-all"><span className="font-medium">{c.key}</span>: <span className="text-danger line-through">{c.from}</span> → <span className="text-success">{c.to}</span></li>
                    ))}
                    {changes.length > 12 ? <li className="text-muted-foreground">and {changes.length - 12} more</li> : null}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
