// Loads .env.local (or .env) for tsx scripts. Next.js loads these itself.
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}
