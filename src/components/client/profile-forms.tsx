"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import { connectTelegramAction, disconnectTelegramAction, updateProfileAction } from "@/app/app/actions";
import { T } from "@/app/app/strings";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

type Area = { id: string; name: string };

export function AddressForm({ initial, areas, effectiveLabel }: {
  initial: { address: string; areaId: string | null; landmark: string; telegramOptIn: boolean }; areas: Area[]; effectiveLabel: string;
}) {
  const router = useRouter();
  const [v, setV] = useState({ ...initial, areaId: initial.areaId ?? "" });
  const [pending, start] = useTransition();
  const save = (next = v) => start(async () => {
    const r = await updateProfileAction({ ...next, areaId: next.areaId || null });
    if (r.ok) { toast.success(r.data.addressChanged ? T.profile.saved(effectiveLabel) : T.profile.savedNoChange); router.refresh(); } else toast.error(r.error);
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="space-y-1.5">
        <Label htmlFor="address">{T.profile.address}</Label>
        <Input id="address" className="h-11" autoComplete="street-address" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="areaId">{T.profile.area}</Label>
        <NativeSelect id="areaId" value={v.areaId} onChange={(e) => setV({ ...v, areaId: e.target.value })}>
          <option value="">{T.profile.chooseArea}</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="landmark">{T.profile.landmark}</Label>
        <Input id="landmark" className="h-11" value={v.landmark} onChange={(e) => setV({ ...v, landmark: e.target.value })} />
      </div>
      <p className="text-xs text-muted-foreground">{T.profile.effective(effectiveLabel)}</p>
      <Button type="submit" className="h-11" disabled={pending}>{T.profile.save}</Button>
      <div className="flex min-h-11 items-center justify-between gap-3 border-t pt-3">
        <Label htmlFor="tg-optin" className="flex min-h-11 flex-1 items-center justify-between gap-3">
          {T.profile.telegramOptIn}
          <Switch id="tg-optin" className="h-7 w-12" checked={v.telegramOptIn} disabled={pending}
            onCheckedChange={(c) => { const next = { ...v, telegramOptIn: c }; setV(next); save(next); }} />
        </Label>
      </div>
    </form>
  );
}

export function TelegramConnect({ linked, configured }: { linked: boolean; configured: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const { pending, run } = useAction();
  if (!configured) return <p className="text-sm text-muted-foreground">{T.profile.notSetUp}</p>;
  if (linked) return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-emerald-700">{T.profile.connected}</p>
      <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => run(() => disconnectTelegramAction())}>{T.profile.disconnect}</Button>
    </div>
  );
  return link ? (
    <div className="space-y-2">
      <Button asChild className="h-11 w-full"><a href={link} target="_blank" rel="noreferrer">{T.profile.open}</a></Button>
      <p className="text-xs text-muted-foreground">{T.profile.openHint}</p>
    </div>
  ) : (
    <Button type="button" className="h-11 w-full" disabled={pending}
      onClick={() => run(() => connectTelegramAction(), (d) => setLink(d.link), "Link ready. Open Telegram and press Start.")}>{T.profile.connect}</Button>
  );
}

export function PasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (next.length < 8) { toast.error("New password must be at least 8 characters."); return; }
      start(async () => {
        const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
        if (error) toast.error(T.profile.passwordFailed); else { toast.success(T.profile.passwordDone); setCur(""); setNext(""); }
      });
    }}>
      <div className="space-y-1.5">
        <Label htmlFor="cur-pw">{T.profile.current}</Label>
        <Input id="cur-pw" type="password" autoComplete="current-password" className="h-11" value={cur} onChange={(e) => setCur(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-pw">{T.profile.next}</Label>
        <Input id="new-pw" type="password" autoComplete="new-password" className="h-11" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <Button type="submit" variant="outline" className="h-11" disabled={pending || !cur || !next}>{T.profile.changePassword}</Button>
    </form>
  );
}
