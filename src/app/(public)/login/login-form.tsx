"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { normalizeEthiopianPhone } from "@/domain/phone";
import { S } from "./strings";

const clientSchema = z.object({
  phone: z.string().refine((v) => normalizeEthiopianPhone(v) !== null, S.invalidPhone),
  password: z.string().min(1, "Enter your password."),
});
const staffSchema = z.object({ email: z.email("Enter a valid email."), password: z.string().min(1, "Enter your password.") });

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const clientForm = useForm<z.infer<typeof clientSchema>>({ resolver: zodResolver(clientSchema), defaultValues: { phone: "", password: "" } });
  const staffForm = useForm<z.infer<typeof staffSchema>>({ resolver: zodResolver(staffSchema), defaultValues: { email: "", password: "" } });
  const done = () => { router.replace(next ?? "/go"); router.refresh(); };

  return (
    <Tabs defaultValue="client" onValueChange={() => setError(null)}>
      <TabsList className="grid h-11 w-full grid-cols-2">
        <TabsTrigger value="client">{S.clientTab}</TabsTrigger>
        <TabsTrigger value="staff">{S.staffTab}</TabsTrigger>
      </TabsList>
      <TabsContent value="client">
        <form className="mt-4 space-y-4" onSubmit={clientForm.handleSubmit(async (v) => {
          setError(null);
          const { error: e } = await authClient.signIn.phoneNumber({ phoneNumber: normalizeEthiopianPhone(v.phone)!, password: v.password });
          if (e) setError(S.failed); else done();
        })}>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{S.phone}</Label>
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" className="h-11" placeholder={S.phoneHint} {...clientForm.register("phone")} />
            {clientForm.formState.errors.phone ? <p className="text-sm text-red-700">{clientForm.formState.errors.phone.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-password">{S.password}</Label>
            <Input id="client-password" type="password" autoComplete="current-password" className="h-11" {...clientForm.register("password")} />
            {clientForm.formState.errors.password ? <p className="text-sm text-red-700">{clientForm.formState.errors.password.message}</p> : null}
          </div>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="h-11 w-full" disabled={clientForm.formState.isSubmitting}>{S.submit}</Button>
        </form>
      </TabsContent>
      <TabsContent value="staff">
        <form className="mt-4 space-y-4" onSubmit={staffForm.handleSubmit(async (v) => {
          setError(null);
          const { error: e } = await authClient.signIn.email({ email: v.email, password: v.password });
          if (e) setError(S.failedStaff); else done();
        })}>
          <div className="space-y-1.5">
            <Label htmlFor="email">{S.email}</Label>
            <Input id="email" type="email" autoComplete="email" className="h-11" {...staffForm.register("email")} />
            {staffForm.formState.errors.email ? <p className="text-sm text-red-700">{staffForm.formState.errors.email.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-password">{S.password}</Label>
            <Input id="staff-password" type="password" autoComplete="current-password" className="h-11" {...staffForm.register("password")} />
          </div>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="h-11 w-full" disabled={staffForm.formState.isSubmitting}>{S.submit}</Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
