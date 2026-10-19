"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEthiopianPhone } from "@/domain/phone";
import { createAccountAction, resetPasswordAction } from "@/app/staff/clients/actions";
import { S } from "@/app/staff/clients/strings";
import { useAction } from "./use-action";

export function AccountBox({ clientId, phone, hasAccount }: { clientId: string; phone: string; hasAccount: boolean }) {
  const { run, pending } = useAction();
  const [password, setPassword] = useState("");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const reset = () => setPassword("");
      if (hasAccount) run(() => resetPasswordAction({ clientId, password }), { onDone: reset });
      else run(() => createAccountAction({ clientId, password }), { onDone: reset });
    }}>
      <p className="text-sm text-muted-foreground">{hasAccount ? S.accountHas(formatEthiopianPhone(phone)) : S.accountNone}</p>
      <div className="space-y-1.5">
        <Label htmlFor="acct-password">{S.password}</Label>
        <Input id="acct-password" type="text" autoComplete="new-password" minLength={8} required className="h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="text-xs text-muted-foreground">{S.passwordHint}</p>
      </div>
      <Button type="submit" variant={hasAccount ? "outline" : "default"} className="h-11 w-full" disabled={pending}>
        {hasAccount ? S.resetPassword : S.createAccount}
      </Button>
    </form>
  );
}
