"use client";

import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

// Same-origin auth client; no secrets. Used only for sign-in and sign-out.
export const authClient = createAuthClient({ plugins: [phoneNumberClient()] });
