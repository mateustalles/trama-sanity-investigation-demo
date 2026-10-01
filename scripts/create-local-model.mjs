import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const localExecutable = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe") : "";
const executable = localExecutable && existsSync(localExecutable) ? localExecutable : "ollama";

const result = spawnSync(executable, ["create", "trama-agent", "-f", path.resolve("Modelfile")], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: executable === "ollama"
});
if (result.status !== 0) process.exit(result.status ?? 1);
