import readline from "node:readline/promises";
import { LocalTramaAgent } from "./agent";

const args = process.argv.slice(2);
const allowWrites = args.includes("--allow-writes");
const interactive = args.includes("--chat");
const prompt = args.filter((arg) => !["--allow-writes", "--chat", "--"].includes(arg)).join(" ").trim();

if (!interactive && !prompt) {
  console.error('Usage: pnpm local:agent -- [--allow-writes] "seu pedido" or pnpm local:chat');
  process.exit(1);
}

const agent = new LocalTramaAgent({ allowWrites });

async function printResult(result: Awaited<ReturnType<LocalTramaAgent["send"]>>, terminal?: readline.Interface) {
  let current = result;
  while (current.type === "approval") {
    if (!terminal) throw new Error(`Write tool ${current.approval.toolName} requires interactive confirmation.`);
    console.log(`\n${current.approval.description}`);
    console.log(current.approval.summary);
    console.log("\nDados técnicos:");
    console.log(JSON.stringify(current.approval.arguments, null, 2));
    const decision = (await terminal.question("Confirmar esta alteração? [s/N] ")).trim().toLowerCase();
    current = await agent.resolveWrite(["y", "yes", "s", "sim"].includes(decision));
  }
  console.log(`\nTrama> ${current.content}`);
}

try {
  await agent.connect();
  if (!interactive) {
    await printResult(await agent.send(prompt));
  } else {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`Trama Local Chat — ${agent.model}`);
    console.log(`Mode: ${allowWrites ? "write with confirmation" : "read-only"}. Commands: /status, /exit`);
    try {
      while (true) {
        const input = (await terminal.question("\nVocê> ")).trim();
        if (!input) continue;
        if (["/exit", "/quit"].includes(input)) break;
        if (input === "/status") {
          console.log(`Model: ${agent.model} | MCP: connected | Mode: ${allowWrites ? "write with confirmation" : "read-only"}`);
          continue;
        }
        try {
          await printResult(await agent.send(input), terminal);
        } catch (error) {
          console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      terminal.close();
    }
  }
} finally {
  await agent.close();
}
