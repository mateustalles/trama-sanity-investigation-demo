import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { TramaService } from "@trama/application";
import { SqliteTramaRepository } from "@trama/database";
import { describe, expect, it } from "vitest";
import { createServiceMcpTransport } from "./create-server";

function serviceFor(actorId: string) {
  let index = 0;
  const repository = new SqliteTramaRepository(":memory:");
  return {
    repository,
    service: new TramaService(
      repository,
      { now: () => new Date("2026-09-08T12:00:00.000Z") },
      { next: () => `${actorId}-${++index}` },
      { type: "user", id: actorId }
    )
  };
}

async function mcpClientFor(service: TramaService) {
  const client = new Client({ name: "mcp-isolation-test", version: "0.1.0" });
  await client.connect(await createServiceMcpTransport(service));
  return client;
}

describe("service-backed MCP transport", () => {
  it("keeps each injected service isolated instead of selecting the local SQLite adapter", async () => {
    const first = serviceFor("workspace-a-user");
    const second = serviceFor("workspace-b-user");
    const firstClient = await mcpClientFor(first.service);
    const secondClient = await mcpClientFor(second.service);

    await firstClient.callTool({
      name: "create_plot",
      arguments: { title: "Trama A", goal: "Isolar A", centralQuestion: "O que pertence a A?", parentPlotId: null }
    });

    const firstPlots = await firstClient.callTool({ name: "list_plots", arguments: {} });
    const secondPlots = await secondClient.callTool({ name: "list_plots", arguments: {} });
    expect((firstPlots.structuredContent as { plots: Array<{ title: string }> }).plots.map((plot) => plot.title)).toEqual(["Trama A"]);
    expect((secondPlots.structuredContent as { plots: Array<{ title: string }> }).plots).toEqual([]);

    await firstClient.close();
    await secondClient.close();
    first.repository.close();
    second.repository.close();
  });
});
