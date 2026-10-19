// Creates a staff user (first admin and later staff) with Better Auth's password hasher.
// Usage: NEW_USER_PASSWORD='…' npm run staff:create -- --email=dagi@questmeals.et --name="Dagi Bekele" --roles=owner,coach
// The password is read from NEW_USER_PASSWORD so it does not end up in shell history or Railway logs.
import "./env";
import { createDb } from "../db/client";
import { createStaffUser } from "../src/server/auth";
import { ROLES, type Role } from "../src/domain/types";

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const email = arg("email"), name = arg("name"), roles = (arg("roles") ?? "").split(",").filter(Boolean) as Role[];
  const password = process.env.NEW_USER_PASSWORD;
  if (!email || !name || roles.length === 0) throw new Error("Give --email, --name and --roles (comma separated)");
  const bad = roles.filter((r) => !ROLES.includes(r) || r === "client");
  if (bad.length) throw new Error(`Unknown or non-staff roles: ${bad.join(", ")}. Staff roles: owner, operations, nutritionist, kitchen, delivery, coach`);
  if (!password || password.length < 10) throw new Error("Set NEW_USER_PASSWORD (at least 10 characters)");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const { db, sql } = createDb(process.env.DATABASE_URL, { max: 1 });
  try {
    const u = await createStaffUser(db, { name, email, password, roles });
    console.log(`Created ${u.email} with roles ${roles.join(", ")}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
