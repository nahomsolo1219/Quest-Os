"use client";

import { useForm, type FieldValues, type Resolver } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SETTINGS_SCHEMAS, type SettingsKey } from "@/domain/settings";
import { useAction } from "./use-action";
import type { ActionResult } from "@/server/actions";

export type FieldKind = "int" | "num" | "pct" | "time" | "bool" | "checks" | "select";
export type FieldSpec = {
  path: string; label: string; kind: FieldKind; help?: string; unit?: string;
  options?: { value: string; label: string; disabled?: boolean }[]; numeric?: boolean;
};
export type FieldGroup = { title: string; help?: string; fields: FieldSpec[] };

const get = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (a == null ? a : (a as Record<string, unknown>)[k]), o);
function set(o: Record<string, unknown>, path: string, v: unknown) {
  const keys = path.split(".");
  let cur = o;
  for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {}) as Record<string, unknown>;
  cur[keys[keys.length - 1]] = v;
}
// RHF treats dots as nesting; keep a flat form keyed by an escaped path instead.
const fk = (path: string) => path.replaceAll(".", "__");

function toForm(value: unknown, groups: FieldGroup[]) {
  const out: Record<string, unknown> = {};
  for (const f of groups.flatMap((g) => g.fields)) {
    const v = get(value, f.path);
    out[fk(f.path)] = f.kind === "pct" ? Math.round(Number(v) * 1000) / 10
      : f.kind === "checks" ? (v as unknown[]).map(String)
      : f.kind === "select" ? String(v) : v;
  }
  return out;
}

function fromForm(form: Record<string, unknown>, base: unknown, groups: FieldGroup[]) {
  const out = structuredClone(base) as Record<string, unknown>;
  for (const f of groups.flatMap((g) => g.fields)) {
    const raw = form[fk(f.path)];
    const v = f.kind === "pct" ? Math.round(Number(raw) * 10) / 1000
      : f.kind === "int" || f.kind === "num" ? Number(raw)
      : f.kind === "checks" ? ((raw as string[] | false) || []).map((x) => (f.numeric ? Number(x) : x))
      : f.kind === "select" ? (f.numeric ? Number(raw) : raw)
      : raw;
    set(out, f.path, v);
  }
  return out;
}

/**
 * Settings group editor. Validates with the domain Zod schema of `settingsKey` in the browser, then the server action
 * validates again and saves through updateSettings (audited). Percent fields are shown as % and stored as fractions.
 */
export function SettingsForm({ settingsKey, value, groups, save, extraCheck, canEdit = true }: {
  settingsKey: SettingsKey;
  value: unknown;
  groups: FieldGroup[];
  save: (value: unknown, reason: string) => Promise<ActionResult<unknown>>;
  extraCheck?: "macroSplit";
  canEdit?: boolean;
}) {
  const { pending, run } = useAction();
  const resolver: Resolver<FieldValues> = async (values) => {
    const parsed = SETTINGS_SCHEMAS[settingsKey].safeParse(fromForm(values, value, groups));
    const errors: Record<string, { type: string; message: string }> = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const p = i.path.join(".");
        const field = groups.flatMap((g) => g.fields).find((f) => p === f.path || p.startsWith(`${f.path}.`));
        // percent fields are shown as %, so show the limits in % too ("<=0.9" -> "<=90%")
        const message = field?.kind === "pct" ? i.message.replace(/\d*\.?\d+/g, (n) => `${Math.round(Number(n) * 1000) / 10}%`) : i.message;
        errors[field ? fk(field.path) : "reason"] = { type: "zod", message };
      }
    } else if (extraCheck === "macroSplit") {
      const s = (parsed.data as { macroSplit: Record<string, { protein: number; carb: number; fat: number }> }).macroSplit;
      for (const g of Object.keys(s)) {
        const sum = s[g].protein + s[g].carb + s[g].fat;
        if (Math.abs(sum - 1) > 0.001) errors[fk(`macroSplit.${g}.fat`)] = { type: "sum", message: `${g === "lean" ? "Lean" : "Build"} split must add up to 100% (now ${Math.round(sum * 1000) / 10}%).` };
      }
    }
    return Object.keys(errors).length ? { values: {}, errors } : { values, errors: {} };
  };
  const form = useForm<FieldValues>({ resolver, defaultValues: { ...toForm(value, groups), reason: "" } });
  const { register, handleSubmit, formState: { errors, isDirty } } = form;

  return (
    <form className="space-y-6" onSubmit={handleSubmit((v) => run(() => save(fromForm(v, value, groups), String(v.reason ?? "")), () => form.reset(v)))}>
      <fieldset disabled={!canEdit} className="space-y-6">
        {groups.map((g) => (
          <section key={g.title} className="space-y-3 rounded-xl border p-4">
            <div>
              <h2 className="font-semibold">{g.title}</h2>
              {g.help ? <p className="text-sm text-muted-foreground">{g.help}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {g.fields.map((f) => {
                const id = `sf-${fk(f.path)}`;
                const e = errors[fk(f.path)]?.message as string | undefined;
                const wide = f.kind === "checks";
                return (
                  <div key={f.path} className={wide ? "col-span-2 space-y-1.5 md:col-span-3 xl:col-span-4" : "flex flex-col justify-end gap-1.5"}>
                    {f.kind === "bool" ? (
                      <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm font-medium">
                        <input id={id} type="checkbox" className="size-5 accent-[#c2410c]" {...register(fk(f.path))} />{f.label}
                      </label>
                    ) : f.kind === "checks" ? (
                      <fieldset>
                        <legend className="text-sm font-medium">{f.label}</legend>
                        <div className="mt-1 flex flex-wrap gap-x-4">
                          {f.options!.map((o) => (
                            <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm">
                              <input type="checkbox" value={o.value} disabled={o.disabled} className="size-5 accent-[#c2410c]" {...register(fk(f.path))} />{o.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : (
                      <>
                        <label htmlFor={id} className="block text-sm font-medium leading-tight">{f.label}{f.unit ? <span className="font-normal text-muted-foreground"> ({f.unit})</span> : null}</label>
                        {f.kind === "select" ? (
                          <select id={id} className="h-11 w-full rounded-md border bg-background px-3" {...register(fk(f.path))}>
                            {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <Input id={id} className="h-11" type={f.kind === "time" ? "time" : "number"} inputMode={f.kind === "int" ? "numeric" : "decimal"}
                            step={f.kind === "int" ? 1 : "any"} {...register(fk(f.path))} />
                        )}
                      </>
                    )}
                    {f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
                    {e ? <p className="text-sm text-red-700">{e}</p> : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {canEdit ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sf-reason">Reason for the change (shown in the change log)</Label>
              <Textarea id="sf-reason" rows={2} {...register("reason")} />
              {errors.reason ? <p className="text-sm text-red-700">{String(errors.reason.message)}</p> : null}
            </div>
            <Button type="submit" className="h-11" disabled={pending || !isDirty}>{pending ? "Saving…" : "Save changes"}</Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
