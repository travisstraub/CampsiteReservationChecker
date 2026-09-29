import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside a React Server environment.
      "server-only": fileURLToPath(new URL("./src/lib/__tests__/empty.ts", import.meta.url)),
    },
  },
  test: { environment: "node" },
});
