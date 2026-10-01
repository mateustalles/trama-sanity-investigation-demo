import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { hostedAuthConfigured } from "../../../lib/supabase/config";
import { currentHostedUser } from "../../../lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const maximumAudioBytes = 10 * 1024 * 1024;

function workspaceRoot() {
  let root = process.cwd();
  while (!existsSync(path.join(root, "pnpm-workspace.yaml")) && path.dirname(root) !== root) root = path.dirname(root);
  return root;
}

function whisperPaths() {
  const root = workspaceRoot();
  return {
    executable: path.join(root, ".local", "whisper", "bin", "Release", "whisper-cli.exe"),
    model: path.join(root, ".local", "whisper", "models", "ggml-base.bin")
  };
}

function run(executable: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: "ignore" });
    const timeout = setTimeout(() => { child.kill(); reject(new Error("A transcrição demorou mais que o esperado.")); }, 55_000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error("O transcritor local não conseguiu processar o áudio.")); });
  });
}

export async function POST(request: Request) {
  if (hostedAuthConfigured() && !await currentHostedUser()) return Response.json({ error: "Autenticação necessária." }, { status: 401 });
  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.length < 44 || audio.length > maximumAudioBytes) return Response.json({ error: "Envie uma gravação curta, de até 10 MB." }, { status: 400 });
  if (audio.subarray(0, 4).toString() !== "RIFF" || audio.subarray(8, 12).toString() !== "WAVE") return Response.json({ error: "Formato de áudio inválido." }, { status: 400 });
  const { executable, model } = whisperPaths();
  if (!existsSync(executable) || !existsSync(model)) return Response.json({ error: "A transcrição local não está instalada neste servidor." }, { status: 503 });

  const directory = path.join(tmpdir(), "trama-transcription");
  const id = randomUUID();
  const input = path.join(directory, `${id}.wav`);
  const output = path.join(directory, `${id}-result`);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(input, audio);
    await run(executable, ["-m", model, "-f", input, "-l", "pt", "-nt", "-otxt", "-of", output]);
    const transcript = (await readFile(`${output}.txt`, "utf8")).replace(/\s+/g, " ").trim();
    return Response.json({ transcript });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível transcrever o áudio." }, { status: 500 });
  } finally {
    await Promise.all([rm(input, { force: true }), rm(`${output}.txt`, { force: true })]);
  }
}
