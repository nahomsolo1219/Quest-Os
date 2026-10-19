"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAreaAction, moveAreaAction, updateAreaAction } from "@/app/staff/settings/actions";
import { useAction } from "./use-action";

const nameSchema = z.object({ name: z.string().trim().min(2, "Area name must be at least 2 letters.").max(60) });

function AreaRow({ area, first, last }: { area: { id: string; name: string; active: boolean }; first: boolean; last: boolean }) {
  const [name, setName] = useState(area.name);
  const { pending, run } = useAction();
  const id = `area-${area.id}`;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`Move ${area.name} up`} disabled={first || pending}
          onClick={() => run(() => moveAreaAction({ id: area.id, direction: "up" }))}>↑</Button>
        <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`Move ${area.name} down`} disabled={last || pending}
          onClick={() => run(() => moveAreaAction({ id: area.id, direction: "down" }))}>↓</Button>
      </div>
      <label htmlFor={id} className="sr-only">Area name</label>
      <Input id={id} value={name} onChange={(e) => setName(e.target.value)} className={`h-11 min-w-0 flex-1 ${area.active ? "" : "text-muted-foreground line-through"}`} />
      <Button type="button" className="h-11" disabled={pending || name.trim() === area.name} onClick={() => run(() => updateAreaAction({ id: area.id, name, active: area.active }))}>Rename</Button>
      <Button type="button" variant="outline" className="h-11" disabled={pending}
        onClick={() => run(() => updateAreaAction({ id: area.id, name: area.name, active: !area.active }))}>{area.active ? "Deactivate" : "Activate"}</Button>
    </li>
  );
}

export function AreasEditor({ areas }: { areas: { id: string; name: string; active: boolean }[] }) {
  const { pending, run } = useAction();
  const form = useForm<z.infer<typeof nameSchema>>({ resolver: zodResolver(nameSchema), defaultValues: { name: "" } });
  return (
    <div className="space-y-4">
      {areas.length ? <ul className="divide-y">{areas.map((a, i) => <AreaRow key={a.id} area={a} first={i === 0} last={i === areas.length - 1} />)}</ul>
        : <p className="text-sm text-muted-foreground">No areas yet. Add the first delivery area below.</p>}
      <form className="flex flex-wrap items-end gap-2" onSubmit={form.handleSubmit((v) => run(() => createAreaAction(v), () => form.reset({ name: "" })))}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="new-area">New area</Label>
          <Input id="new-area" className="h-11" placeholder="e.g. Summit" {...form.register("name")} />
          {form.formState.errors.name ? <p className="text-sm text-red-700">{form.formState.errors.name.message}</p> : null}
        </div>
        <Button type="submit" className="h-11" disabled={pending}>Add area</Button>
      </form>
    </div>
  );
}
