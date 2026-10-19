"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestSizeChangeAction } from "@/app/app/actions";
import { T } from "@/app/app/strings";
import { useAction } from "./use-action";

export function SizeRequestForm() {
  const [note, setNote] = useState("");
  const { pending, run } = useAction();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => requestSizeChangeAction({ note }), () => setNote("")); }}>
      <Label htmlFor="size-note">{T.plan.sizeChangeLabel}</Label>
      <Textarea id="size-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="submit" className="h-11" disabled={pending || note.trim().length < 3}>{T.plan.sizeChangeSend}</Button>
    </form>
  );
}
