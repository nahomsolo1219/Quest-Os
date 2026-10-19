"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateClientAction } from "@/app/staff/clients/actions";
import { S } from "@/app/staff/clients/strings";
import { useAction } from "./use-action";

export function NotesForm({ clientId, notes }: { clientId: string; notes: string | null }) {
  const { run, pending } = useAction();
  const [value, setValue] = useState(notes ?? "");
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => updateClientAction({ clientId, fields: { notes: value } })); }}>
      <Label htmlFor="client-notes">{S.tabs.notes}</Label>
      <Textarea id="client-notes" rows={6} value={value} onChange={(e) => setValue(e.target.value)} />
      <Button type="submit" className="h-11" disabled={pending}>{S.saveNotes}</Button>
    </form>
  );
}
