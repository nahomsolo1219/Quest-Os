"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import { joinWaitlist, WAITLIST_FASTING, WAITLIST_GOALS } from "@/server/services/waitlist";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  phone: z.string().trim().min(7, "Enter your phone number.").max(20),
  areaId: z.string().uuid().nullable(),
  goal: z.enum(WAITLIST_GOALS, { message: "Choose your goal." }),
  fasting: z.enum(WAITLIST_FASTING, { message: "Choose a fasting option." }),
  telegram: z.boolean(),
  source: z.string().max(40).nullable(),
  website: z.string().max(0, "Something went wrong."), // honeypot: real people leave it empty
});

export async function joinWaitlistAction(input: unknown) {
  return runAction(schema, input, (ctx, data) => joinWaitlist(ctx, { ...data, source: data.source }));
}
