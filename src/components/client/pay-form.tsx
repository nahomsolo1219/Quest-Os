"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadReceiptAction } from "@/app/app/actions";
import { T } from "@/app/app/strings";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const METHODS = ["telebirr", "cbe", "cash"] as const;

/** Receipt upload (PAY-02): the photo is compressed in the browser (max 1600 px, ~0.5 MB) before upload. */
export function PayForm({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<(typeof METHODS)[number]>("telebirr");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = () => start(async () => {
    if (method !== "cash" && !reference.trim()) { toast.error("Enter the transaction reference from your receipt."); return; }
    if (method !== "cash" && !file) { toast.error("Add a photo of your receipt."); return; }
    const fd = new FormData();
    fd.set("invoiceId", invoiceId);
    fd.set("method", method);
    fd.set("reference", reference);
    if (file && method !== "cash") {
      const { default: imageCompression } = await import("browser-image-compression");
      const small = await imageCompression(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.5, useWebWorker: true }).catch(() => file);
      fd.set("receipt", new File([small], file.name.replace(/\.\w+$/, "") + ".jpg", { type: small.type || "image/jpeg" }));
    }
    const r = await uploadReceiptAction(fd);
    if (r.ok) { toast.success(r.message ?? "Receipt sent."); setFile(null); setReference(""); router.refresh(); } else toast.error(r.error);
  });

  const id = (k: string) => `${k}-${invoiceId}`;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{T.payments.method}</legend>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => (
            <label key={m} className={cn("flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 text-center text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              method === m ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
              <input type="radio" name={id("method")} value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
              {method === m ? <Check aria-hidden className="size-4 shrink-0 text-lime" /> : null}
              {T.payments.methods[m]}
            </label>
          ))}
        </div>
      </fieldset>
      {method === "cash" ? <p className="text-sm text-muted-foreground">{T.payments.cashHint}</p> : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={id("ref")}>{T.payments.reference}</Label>
            <Input id={id("ref")} className="h-11" placeholder={T.payments.referenceHint} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("receipt")}>{T.payments.receipt}</Label>
            <Input id={id("receipt")} type="file" accept="image/*" className="h-11 py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">{T.payments.receiptHint}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt={T.payments.preview} className="max-h-64 rounded-lg border object-contain" /> : null}
          </div>
        </>
      )}
      <Button type="submit" className="h-12 w-full text-base" disabled={pending}>{pending ? T.payments.sending : T.payments.send}</Button>
    </form>
  );
}
