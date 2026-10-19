"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { S } from "@/app/app/community/strings";

const TYPES = ["post", "progress", "question", "announcement"] as const;
const schema = z.object({
  type: z.enum(TYPES),
  body: z.string().trim().min(1, "Write something before posting.").max(2000, "Posts can be at most 2,000 characters."),
  shareProgress: z.boolean(),
});
type Values = z.infer<typeof schema>;
type Photo = { file: File; url: string };

/** New post: type, text (≤ 2000), up to 4 photos compressed in the browser (≤ 1600 px), optional progress share. */
export function NewPostForm({ coach, progressText, maxPhotos, maxEdge, initialType }: {
  coach: boolean; progressText: string | null; maxPhotos: number; maxEdge: number; initialType?: Values["type"];
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [compressing, setCompressing] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { type: initialType ?? "post", body: "", shareProgress: false } });
  const type = form.watch("type");
  const len = form.watch("body").length;
  const share = form.watch("shareProgress");
  const types = TYPES.filter((t) => t !== "announcement" || coach);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const room = maxPhotos - photos.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) toast.error(`Add at most ${maxPhotos} photos.`);
    if (files.length === 0) return;
    setCompressing(true);
    try {
      const { default: compress } = await import("browser-image-compression");
      const out: Photo[] = [];
      for (const f of files) {
        const c = await compress(f, { maxWidthOrHeight: maxEdge, maxSizeMB: 0.5, useWebWorker: true, fileType: "image/jpeg", initialQuality: 0.8 });
        const file = new File([c], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
        out.push({ file, url: URL.createObjectURL(file) });
      }
      setPhotos((cur) => [...cur, ...out].slice(0, maxPhotos));
    } catch {
      toast.error("That photo could not be read. Try a JPG or PNG.");
    } finally {
      setCompressing(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(async (v) => {
      const fd = new FormData();
      fd.set("type", v.type);
      fd.set("body", v.body);
      fd.set("shareProgress", String(v.type === "progress" && v.shareProgress));
      for (const p of photos) fd.append("photos", p.file, p.file.name);
      let r: { ok: boolean; error?: string; data?: { id: string } };
      try {
        const res = await fetch("/app/community/posts", { method: "POST", body: fd });
        r = await res.json();
      } catch {
        r = { ok: false, error: "No connection. Check your internet and try again." };
      }
      if (!r.ok || !r.data) { toast.error(r.error ?? "Could not post."); return; }
      toast.success(S.posted);
      router.push(`/app/community/${r.data.id}`);
      router.refresh();
    })}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{S.typeLabel}</legend>
        <div className="grid grid-cols-2 gap-2">
          {types.map((t) => (
            <label key={t} className={cn("flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-center text-sm font-semibold",
              type === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
              <input type="radio" value={t} className="sr-only" {...form.register("type")} />
              {t === "question" ? "Question" : S.types[t]}
            </label>
          ))}
        </div>
        {type === "question" ? <p className="text-xs text-muted-foreground">{S.types.question}: Dagi or Kidus will answer.</p> : null}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="body">{S.bodyLabel}</Label>
        <Textarea id="body" rows={6} maxLength={2000} placeholder={S.bodyPlaceholder} {...form.register("body")} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="text-red-700">{form.formState.errors.body?.message}</span>
          <span>{S.chars(len, 2000)}</span>
        </div>
      </div>

      {type === "progress" ? (
        <div className="rounded-xl border p-3">
          <div className="flex items-start gap-3">
            <Checkbox id="share" className="mt-0.5 size-5" disabled={!progressText} checked={share}
              onCheckedChange={(c) => form.setValue("shareProgress", c === true)} />
            <div>
              <Label htmlFor="share" className="font-semibold">{S.shareProgress}</Label>
              <p className="mt-0.5 text-sm text-muted-foreground">{progressText ? S.shareHint(progressText) : S.noProgress}</p>
            </div>
          </div>
          {progressText && share ? <p className="stat-number mt-3 text-2xl font-bold text-primary">{progressText}</p> : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="photos">{S.photosLabel}</Label>
        {photos.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${i + 1}`} width={160} height={160} className="aspect-square w-full rounded-lg object-cover" />
                <button type="button" aria-label={`${S.removePhoto} ${i + 1}`} onClick={() => setPhotos((cur) => cur.filter((x) => x !== p))}
                  className="absolute -right-1 -top-1 flex size-8 items-center justify-center rounded-full bg-foreground text-background">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {photos.length < maxPhotos ? (
          <label htmlFor="photos" className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-sm font-semibold hover:bg-accent">
            <ImagePlus className="size-4" aria-hidden />{compressing ? S.compressing : S.addPhotos}
            <input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={compressing}
              onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          </label>
        ) : null}
        <p className="text-xs text-muted-foreground">{S.photosHint}</p>
      </div>

      <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting || compressing}>
        {form.formState.isSubmitting ? S.posting : S.submit}
      </Button>
    </form>
  );
}
