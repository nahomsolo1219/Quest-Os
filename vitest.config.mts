import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "src"), "@db": path.resolve(__dirname, "db") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "domain", include: ["src/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["db/tests/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          globalSetup: ["db/tests/global-setup.ts"],
          testTimeout: 30000,
          hookTimeout: 120000,
        },
      },
    ],
  },
});
