import path from "node:path";
import { AsyncTramaService, TramaService } from "@trama/application";
import { PostgresTramaRepository, SqliteTramaRepository } from "@trama/database";
import { systemClock, uuidGenerator } from "@trama/testing";
import { hostedAuthConfigured } from "./supabase/config";
import { requireHostedWorkspace } from "./supabase/workspace";

const SERVICE_VERSION = "conversation-memory-v1";
const globalState = globalThis as typeof globalThis & {
  tramaService?: TramaService;
  tramaServiceVersion?: string;
  hostedRepositories?: Map<string, PostgresTramaRepository>;
};

export function getTramaService(): TramaService {
  if (!globalState.tramaService || globalState.tramaServiceVersion !== SERVICE_VERSION) {
    const filename = process.env.TRAMA_DATABASE_PATH
      ?? path.resolve(process.cwd(), "../../.trama/trama.db");
    const repository = new SqliteTramaRepository(filename);
    globalState.tramaService = new TramaService(
      repository,
      systemClock,
      uuidGenerator,
      { type: "user", id: "local-user" }
    );
    globalState.tramaServiceVersion = SERVICE_VERSION;
  }
  return globalState.tramaService;
}

export async function getRequestTramaService(): Promise<TramaService | AsyncTramaService> {
  if (!hostedAuthConfigured()) return getTramaService();
  const context = await requireHostedWorkspace();
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is required in hosted mode.");
  const repositories = globalState.hostedRepositories ??= new Map();
  let repository = repositories.get(context.workspaceId);
  if (!repository) {
    repository = new PostgresTramaRepository(connectionString, context.workspaceId);
    repositories.set(context.workspaceId, repository);
  }
  return new AsyncTramaService(
    repository,
    systemClock,
    uuidGenerator,
    { type: "user", id: context.userId }
  );
}
