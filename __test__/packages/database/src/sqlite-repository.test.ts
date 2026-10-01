import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteTramaRepository } from "../../../../packages/database/src/sqlite-repository";

describe("SqliteTramaRepository migrations", () => {
  it("makes audit event plot IDs nullable without losing existing events", () => {
    const directory = mkdtempSync(join(tmpdir(), "trama-migration-"));
    const filename = join(directory, "trama.db");
    const legacy = new DatabaseSync(filename);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE plots (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL REFERENCES plots(id),
        entity_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX audit_events_plot_id_idx ON audit_events(plot_id, occurred_at);
    `);
    const plot = { id: "plot-1", parentPlotId: null, title: "Casa", goal: "Organizar.",
      centralQuestion: "O que falta?", status: "active",
      createdAt: "2026-08-05T12:00:00.000Z", updatedAt: "2026-08-05T12:00:00.000Z" };
    const event = { id: "event-1", plotId: "plot-1", entityType: "plot", entityId: "plot-1",
      eventType: "plot.created", actorType: "user", actorId: "mateus", before: null,
      after: plot, occurredAt: "2026-08-05T12:00:00.000Z" };
    legacy.prepare("INSERT INTO plots VALUES (?, ?, ?)")
      .run(plot.id, JSON.stringify(plot), plot.updatedAt);
    legacy.prepare("INSERT INTO audit_events VALUES (?, ?, ?, ?, ?)")
      .run(event.id, event.plotId, event.entityId, event.occurredAt, JSON.stringify(event));
    legacy.close();

    const repository = new SqliteTramaRepository(filename);
    const columns = repository.database.prepare("PRAGMA table_info(audit_events)").all() as
      Array<{ name: string; notnull: number }>;
    const plotIdColumn = columns.find((column) => column.name === "plot_id");

    expect(plotIdColumn?.notnull).toBe(0);
    expect(repository.getPlot(plot.id)?.lifecycleType).toBe("resolvable");
    expect(repository.listAuditEvents(plot.id)).toHaveLength(1);
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
