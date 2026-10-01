import { dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const command = process.argv[2];

if (command !== "build" && command !== "dev") {
  throw new Error("Expected a Next.js command: build or dev.");
}

process.env.NEXT_TEST_WASM_DIR = dirname(
  require.resolve("@next/swc-wasm-nodejs/package.json")
);
process.argv = [
  process.execPath,
  require.resolve("next/dist/bin/next"),
  command,
  "--webpack"
];

await import(pathToFileURL(require.resolve("next/dist/bin/next")).href);
