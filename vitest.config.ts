import { defineConfig } from "vitest/config";
import {fileURLToPath} from "node:url";

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(["ai", "application", "core", "database", "schemas", "testing"]
      .map(name => [`@trama/${name}`, fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))]))
  },
  test: {
    include: ["__test__/**/*.test.ts"]
  }
});
