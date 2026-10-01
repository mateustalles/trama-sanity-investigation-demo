import { randomUUID } from "node:crypto";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TramaService } from "@trama/application";
import { SqliteTramaRepository } from "@trama/database";
import { createTramaMcpServer } from "./create-server";

const databasePath = process.env.TRAMA_DATABASE_PATH
  ?? path.resolve(process.cwd(), ".trama/trama.db");
const repository = new SqliteTramaRepository(databasePath);
const service = new TramaService(
  repository,
  { now: () => new Date() },
  { next: () => randomUUID() },
  { type: "agent", id: "codex-mcp" }
);
const server = createTramaMcpServer(service);
const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", () => {
  repository.close();
  process.exit(0);
});
