"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/public/phone-input";
import { ChoiceGroup } from "@/components/public/choice-group";
import { joinWaitlistAction } from "./actions";

type Goal = "lose" | "build" | "healthy";
type Fasting = "wed_fri" | "seasons" | "none";

export function WaitlistForm({ areas, source }: { areas: { id: string; name: string }[]; source: string | null }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [areaId, setAreaId] = useState("");
  const [goal, setGoal] = useState<Goal>();
  const [fasting, setFasting] = useState<Fasting>();
  const [telegram, setTelegram] = useState(true);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="flex flex-col items-start gap-3 py-2" role="status">
        <CheckCircle2 className="size-10 text-sage" aria-hidden />
        <h2 className="text-xl font-bold text-primary">You’re on the list.</h2>
        <p className="text-muted-foreground">We’ll message you before we open on 30 November. While you wait, find your daily calories and macros.</p>
        <Button asChild className="mt-1 h-11"><Link href="/calculator">Find my calories</Link></Button>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await joinWaitlistAction({ name, phone, areaId: areaId || null, goal, fasting, telegram, source, website });
      if (r.ok) setDone(true);
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="wl-name">Your name</Label>
        <Input id="wl-name" className="h-11" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wl-phone">Phone (Telebirr number is best)</Label>
        <PhoneInput id="wl-phone" placeholder="9XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      {areas.length ? (
        <div className="space-y-1.5">
          <Label htmlFor="wl-area">Where would you get your meals?</Label>
          <select id="wl-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-base shadow-xs md:text-sm">
            <option value="">Choose an area (optional)</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      ) : null}
      <ChoiceGroup name="goal" legend="Your goal" value={goal} onChange={setGoal} columns={3} options={[
        { value: "lose", label: "Lose fat" }, { value: "build", label: "Build muscle" }, { value: "healthy", label: "Eat healthier" },
      ]} />
      <ChoiceGroup name="fasting" legend="Do you fast?" value={fasting} onChange={setFasting} columns={1} options={[
        { value: "wed_fri", label: "Wednesdays and Fridays" },
        { value: "seasons", label: "Wed & Fri and the fasting seasons" },
        { value: "none", label: "I don’t fast" },
      ]} />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-[#11301A]" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />
        Message me on Telegram about the launch
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
      {error ? <p className="text-sm font-medium text-destructive" role="alert">{error}</p> : null}
      <Button type="submit" disabled={pending} className="h-12 w-full bg-lime text-base text-forest hover:bg-lime/90">
        {pending ? "Joining…" : "Join the waitlist"}
      </Button>
    </form>
  );
}
