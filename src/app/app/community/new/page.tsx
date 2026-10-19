import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { AccessBanner } from "@/components/community/access-banner";
import { NewPostForm } from "@/components/community/new-post-form";
import { NoAccess } from "@/components/community/no-access";
import { ForbiddenError } from "@/server/authz";
import { myProgress, publicViewer, viewer } from "@/server/services/community";
import { loadSettings } from "@/server/services/settings";
import { requirePageActor, serviceCtx } from "@/server/session";
import { formatAddisDateTime } from "@/domain/time";
import { POST_TYPES, type PostType } from "@/domain/types";
import { S } from "../strings";

export const dynamic = "force-dynamic";

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const actor = await requirePageActor("client", "coach", "owner", "operations");
  const sp = await searchParams;
  const ctx = await serviceCtx(actor);
  let v;
  try {
    v = publicViewer(await viewer(ctx));
  } catch (e) {
    if (e instanceof ForbiddenError) return <NoAccess message={e.message} />;
    throw e;
  }
  if (v.access === "none") return <NoAccess message="Your community access has ended. Renew your plan to join again." />;
  const [progress, settings] = await Promise.all([myProgress(ctx), loadSettings(ctx.db)]);
  const initial = (POST_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as PostType) : undefined;
  return (
    <div>
      <Link href="/app/community" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />{S.back}
      </Link>
      <PageHeader title={S.newTitle} />
      <AccessBanner viewer={v} mutedLabel={v.mutedUntil ? formatAddisDateTime(new Date(v.mutedUntil)) : null} />
      {v.canPost ? (
        <NewPostForm coach={v.coach} progressText={progress?.text ?? null} maxPhotos={settings.community.maxPhotos}
          maxEdge={settings.community.photoMaxEdgePx} initialType={initial === "announcement" && !v.coach ? "post" : initial} />
      ) : null}
    </div>
  );
}
