import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TramaRepository } from "@trama/core";
import {
  actionSchema,
  actionProgressSchema,
  attentionItemSchema,
  auditEventSchema,
  notificationSchema,
  openLoopSchema,
  plotSchema,
  requiredInputSchema,
  reviewRunSchema,
  conversationSchema,
  conversationMessageSchema,
  conversationContextSchema,
  conversationOperationSchema,
  type Action,
  type ActionProgress,
  type AttentionItem,
  type AuditEvent,
  type Notification,
  type OpenLoop,
  type Plot,
  type RequiredInput,
  type ReviewRun
  , type Conversation, type ConversationMessage, type ConversationContext,
  type ConversationOperation, type ConversationEntityType
} from "@trama/schemas";

type JsonRow = { payload: string };

export class SqliteTramaRepository implements TramaRepository {
  readonly database: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  close(): void {
    this.database.close();
  }

  transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  createPlot(plot: Plot): void {
    this.insert("plots", plot.id, plot);
  }

  updatePlot(plot: Plot): void {
    const result = this.database.prepare(
      "UPDATE plots SET payload = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(plot), plot.updatedAt, plot.id);
    if (result.changes !== 1) throw new Error(`Plot not found: ${plot.id}`);
  }

  getPlot(id: string): Plot | null {
    return this.get("plots", id, plotSchema);
  }

  listPlots(): Plot[] {
    return this.list("plots", plotSchema);
  }

  createOpenLoop(openLoop: OpenLoop): void {
    this.database.prepare(
      "INSERT INTO open_loops (id, plot_id, payload, updated_at) VALUES (?, ?, ?, ?)"
    ).run(openLoop.id, openLoop.plotId, JSON.stringify(openLoop), openLoop.updatedAt);
  }

  updateOpenLoop(openLoop: OpenLoop): void {
    const result = this.database.prepare(
      "UPDATE open_loops SET payload = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(openLoop), openLoop.updatedAt, openLoop.id);
    if (result.changes !== 1) throw new Error(`OpenLoop not found: ${openLoop.id}`);
  }

  getOpenLoop(id: string): OpenLoop | null {
    return this.get("open_loops", id, openLoopSchema);
  }

  listOpenLoops(plotId: string): OpenLoop[] {
    return this.listByPlot("open_loops", plotId, openLoopSchema);
  }

  createAction(action: Action): void {
    this.database.prepare(
      "INSERT INTO actions (id, plot_id, payload, updated_at) VALUES (?, ?, ?, ?)"
    ).run(action.id, action.plotId, JSON.stringify(action), action.updatedAt);
  }

  updateAction(action: Action): void {
    const result = this.database.prepare(
      "UPDATE actions SET payload = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(action), action.updatedAt, action.id);
    if (result.changes !== 1) throw new Error(`Action not found: ${action.id}`);
  }

  getAction(id: string): Action | null {
    return this.get("actions", id, actionSchema);
  }

  listActions(plotId: string): Action[] {
    return this.listByPlot("actions", plotId, actionSchema);
  }

  appendActionProgress(progress: ActionProgress): void {
    this.database.prepare(
      "INSERT INTO action_progress (id, plot_id, action_id, occurred_at, payload) VALUES (?, ?, ?, ?, ?)"
    ).run(progress.id, progress.plotId, progress.actionId, progress.occurredAt, JSON.stringify(progress));
  }

  listActionProgress(actionId: string): ActionProgress[] {
    const rows = this.database.prepare(
      "SELECT payload FROM action_progress WHERE action_id = ? ORDER BY occurred_at, rowid"
    ).all(actionId) as JsonRow[];
    return rows.map((row) => actionProgressSchema.parse(JSON.parse(row.payload)));
  }

  listPlotActionProgress(plotId: string): ActionProgress[] {
    const rows = this.database.prepare(
      "SELECT payload FROM action_progress WHERE plot_id = ? ORDER BY occurred_at, rowid"
    ).all(plotId) as JsonRow[];
    return rows.map((row) => actionProgressSchema.parse(JSON.parse(row.payload)));
  }

  appendAuditEvent(event: AuditEvent): void {
    this.database.prepare(
      "INSERT INTO audit_events (id, plot_id, entity_id, occurred_at, payload) VALUES (?, ?, ?, ?, ?)"
    ).run(event.id, event.plotId, event.entityId, event.occurredAt, JSON.stringify(event));
  }

  listAuditEvents(plotId: string): AuditEvent[] {
    const rows = this.database.prepare(
      "SELECT payload FROM audit_events WHERE plot_id = ? ORDER BY occurred_at DESC"
    ).all(plotId) as JsonRow[];
    return rows.map((row) => auditEventSchema.parse(JSON.parse(row.payload)));
  }

  createReviewRun(reviewRun: ReviewRun): void {
    this.database.prepare(
      "INSERT INTO review_runs (id, idempotency_key, status, started_at, payload) VALUES (?, ?, ?, ?, ?)"
    ).run(reviewRun.id, reviewRun.idempotencyKey, reviewRun.status, reviewRun.startedAt, JSON.stringify(reviewRun));
  }

  updateReviewRun(reviewRun: ReviewRun): void {
    this.updatePayload("review_runs", reviewRun.id, reviewRun, reviewRun.status);
  }

  getReviewRunByIdempotencyKey(idempotencyKey: string): ReviewRun | null {
    const row = this.database.prepare("SELECT payload FROM review_runs WHERE idempotency_key = ?")
      .get(idempotencyKey) as JsonRow | undefined;
    return row ? reviewRunSchema.parse(JSON.parse(row.payload)) : null;
  }

  createAttentionItem(item: AttentionItem): void {
    this.database.prepare(
      "INSERT INTO attention_items (id, plot_id, fingerprint, status, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(item.id, item.plotId, item.fingerprint, item.status, item.lastDetectedAt, JSON.stringify(item));
  }

  updateAttentionItem(item: AttentionItem): void {
    this.database.prepare(
      "UPDATE attention_items SET status = ?, updated_at = ?, payload = ? WHERE id = ?"
    ).run(item.status, item.lastDetectedAt, JSON.stringify(item), item.id);
  }

  getOpenAttentionItem(fingerprint: string): AttentionItem | null {
    const row = this.database.prepare(
      "SELECT payload FROM attention_items WHERE fingerprint = ? AND status IN ('open', 'acknowledged') LIMIT 1"
    ).get(fingerprint) as JsonRow | undefined;
    return row ? attentionItemSchema.parse(JSON.parse(row.payload)) : null;
  }

  listOpenAttentionItems(): AttentionItem[] {
    const rows = this.database.prepare(
      "SELECT payload FROM attention_items WHERE status IN ('open', 'acknowledged')"
    ).all() as JsonRow[];
    return rows.map((row) => attentionItemSchema.parse(JSON.parse(row.payload)));
  }

  createRequiredInput(input: RequiredInput): void {
    this.database.prepare(
      "INSERT INTO required_inputs (id, plot_id, attention_item_id, input_key, status, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(input.id, input.plotId, input.attentionItemId, input.key, input.status, input.createdAt, JSON.stringify(input));
  }

  updateRequiredInput(input: RequiredInput): void {
    const updatedAt = input.answeredAt ?? input.dismissedAt ?? input.createdAt;
    this.database.prepare(
      "UPDATE required_inputs SET status = ?, updated_at = ?, payload = ? WHERE id = ?"
    ).run(input.status, updatedAt, JSON.stringify(input), input.id);
  }

  getRequiredInput(id: string): RequiredInput | null {
    return this.get("required_inputs", id, requiredInputSchema);
  }

  getOpenRequiredInput(attentionItemId: string, key: string): RequiredInput | null {
    const row = this.database.prepare(
      "SELECT payload FROM required_inputs WHERE attention_item_id = ? AND input_key = ? AND status = 'open' LIMIT 1"
    ).get(attentionItemId, key) as JsonRow | undefined;
    return row ? requiredInputSchema.parse(JSON.parse(row.payload)) : null;
  }

  listOpenRequiredInputs(plotId: string): RequiredInput[] {
    const rows = this.database.prepare(
      "SELECT payload FROM required_inputs WHERE plot_id = ? AND status = 'open' ORDER BY updated_at"
    ).all(plotId) as JsonRow[];
    return rows.map((row) => requiredInputSchema.parse(JSON.parse(row.payload)));
  }

  createNotification(notification: Notification): void {
    this.database.prepare(
      "INSERT INTO notifications (id, plot_id, dedupe_key, status, next_attempt_at, payload) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(notification.id, notification.plotId, notification.dedupeKey, notification.status,
      notification.nextAttemptAt, JSON.stringify(notification));
  }

  updateNotification(notification: Notification): void {
    this.database.prepare(
      "UPDATE notifications SET status = ?, next_attempt_at = ?, payload = ? WHERE id = ?"
    ).run(notification.status, notification.nextAttemptAt, JSON.stringify(notification), notification.id);
  }

  getNotificationByDedupeKey(dedupeKey: string): Notification | null {
    const row = this.database.prepare("SELECT payload FROM notifications WHERE dedupe_key = ?")
      .get(dedupeKey) as JsonRow | undefined;
    return row ? notificationSchema.parse(JSON.parse(row.payload)) : null;
  }

  listPendingNotifications(now: string, limit: number): Notification[] {
    const rows = this.database.prepare(
      "SELECT payload FROM notifications WHERE status IN ('pending', 'failed') AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?"
    ).all(now, limit) as JsonRow[];
    return rows.map((row) => notificationSchema.parse(JSON.parse(row.payload)));
  }

  createConversation(conversation: Conversation): void {
    this.database.prepare("INSERT INTO conversations (id, entity_type, entity_id, status, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?)")
      .run(conversation.id, conversation.primaryEntityType, conversation.primaryEntityId, conversation.status, conversation.updatedAt, JSON.stringify(conversation));
  }

  updateConversation(conversation: Conversation): void {
    const result = this.database.prepare("UPDATE conversations SET status = ?, updated_at = ?, payload = ? WHERE id = ?")
      .run(conversation.status, conversation.updatedAt, JSON.stringify(conversation), conversation.id);
    if (result.changes !== 1) throw new Error(`Conversation not found: ${conversation.id}`);
  }

  getConversation(id: string): Conversation | null {
    return this.get("conversations", id, conversationSchema);
  }

  listConversations(entityType: ConversationEntityType, entityId: string): Conversation[] {
    const rows = this.database.prepare("SELECT payload FROM conversations WHERE entity_type = ? AND entity_id = ? ORDER BY updated_at DESC")
      .all(entityType, entityId) as JsonRow[];
    return rows.map((row) => conversationSchema.parse(JSON.parse(row.payload)));
  }

  appendConversationMessage(message: ConversationMessage): void {
    this.database.prepare("INSERT INTO conversation_messages (id, conversation_id, created_at, payload) VALUES (?, ?, ?, ?)")
      .run(message.id, message.conversationId, message.createdAt, JSON.stringify(message));
  }

  listConversationMessages(conversationId: string): ConversationMessage[] {
    const rows = this.database.prepare("SELECT payload FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at, rowid")
      .all(conversationId) as JsonRow[];
    return rows.map((row) => conversationMessageSchema.parse(JSON.parse(row.payload)));
  }

  createConversationContext(context: ConversationContext): void {
    this.database.prepare("INSERT OR IGNORE INTO conversation_contexts (id, conversation_id, entity_type, entity_id, relation, created_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(context.id, context.conversationId, context.entityType, context.entityId, context.relation, context.createdAt, JSON.stringify(context));
  }

  listConversationContexts(conversationId: string): ConversationContext[] {
    const rows = this.database.prepare("SELECT payload FROM conversation_contexts WHERE conversation_id = ? ORDER BY created_at, rowid")
      .all(conversationId) as JsonRow[];
    return rows.map((row) => conversationContextSchema.parse(JSON.parse(row.payload)));
  }

  createConversationOperation(operation: ConversationOperation): void {
    this.database.prepare("INSERT INTO conversation_operations (id, conversation_id, status, created_at, payload) VALUES (?, ?, ?, ?, ?)")
      .run(operation.id, operation.conversationId, operation.status, operation.createdAt, JSON.stringify(operation));
  }

  updateConversationOperation(operation: ConversationOperation): void {
    const result = this.database.prepare("UPDATE conversation_operations SET status = ?, payload = ? WHERE id = ?")
      .run(operation.status, JSON.stringify(operation), operation.id);
    if (result.changes !== 1) throw new Error(`ConversationOperation not found: ${operation.id}`);
  }

  getConversationOperation(id: string): ConversationOperation | null {
    return this.get("conversation_operations", id, conversationOperationSchema);
  }

  listConversationOperations(conversationId: string): ConversationOperation[] {
    const rows = this.database.prepare("SELECT payload FROM conversation_operations WHERE conversation_id = ? ORDER BY created_at, rowid")
      .all(conversationId) as JsonRow[];
    return rows.map((row) => conversationOperationSchema.parse(JSON.parse(row.payload)));
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS plots (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS open_loops (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL REFERENCES plots(id),
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS open_loops_plot_id_idx ON open_loops(plot_id);
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL REFERENCES plots(id),
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS actions_plot_id_idx ON actions(plot_id);
      CREATE TABLE IF NOT EXISTS action_progress (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL REFERENCES plots(id),
        action_id TEXT NOT NULL REFERENCES actions(id),
        occurred_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS action_progress_action_id_idx ON action_progress(action_id, occurred_at);
      CREATE INDEX IF NOT EXISTS action_progress_plot_id_idx ON action_progress(plot_id, occurred_at);
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        plot_id TEXT REFERENCES plots(id),
        entity_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_events_plot_id_idx ON audit_events(plot_id, occurred_at);
      CREATE TABLE IF NOT EXISTS review_runs (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attention_items (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL REFERENCES plots(id),
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS attention_items_open_fingerprint_idx
        ON attention_items(fingerprint) WHERE status IN ('open', 'acknowledged');
      CREATE INDEX IF NOT EXISTS attention_items_plot_status_idx ON attention_items(plot_id, status);
      CREATE TABLE IF NOT EXISTS required_inputs (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL REFERENCES plots(id),
        attention_item_id TEXT NOT NULL REFERENCES attention_items(id),
        input_key TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS required_inputs_open_key_idx
        ON required_inputs(attention_item_id, input_key) WHERE status = 'open';
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL REFERENCES plots(id),
        dedupe_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        next_attempt_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notifications_delivery_idx ON notifications(status, next_attempt_at);
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversations_entity_idx ON conversations(entity_type, entity_id, updated_at);
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversation_messages_conversation_idx ON conversation_messages(conversation_id, created_at);
      CREATE TABLE IF NOT EXISTS conversation_contexts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        UNIQUE(conversation_id, entity_type, entity_id, relation)
      );
      CREATE INDEX IF NOT EXISTS conversation_contexts_entity_idx ON conversation_contexts(entity_type, entity_id);
      CREATE TABLE IF NOT EXISTS conversation_operations (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversation_operations_conversation_idx ON conversation_operations(conversation_id, created_at);
    `);
    this.ensureNullableAuditPlotId();
  }

  private ensureNullableAuditPlotId(): void {
    const columns = this.database.prepare("PRAGMA table_info(audit_events)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    if (columns.find((column) => column.name === "plot_id")?.notnull !== 1) return;

    this.database.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;");
    try {
      this.database.exec(`
        CREATE TABLE audit_events_v2 (
          id TEXT PRIMARY KEY,
          plot_id TEXT REFERENCES plots(id),
          entity_id TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          payload TEXT NOT NULL
        );
        INSERT INTO audit_events_v2 (id, plot_id, entity_id, occurred_at, payload)
          SELECT id, plot_id, entity_id, occurred_at, payload FROM audit_events;
        DROP TABLE audit_events;
        ALTER TABLE audit_events_v2 RENAME TO audit_events;
        CREATE INDEX audit_events_plot_id_idx ON audit_events(plot_id, occurred_at);
        COMMIT;
      `);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.database.exec("PRAGMA foreign_keys = ON");
    }
  }

  private insert(table: "plots", id: string, payload: Plot): void {
    this.database.prepare(
      `INSERT INTO ${table} (id, payload, updated_at) VALUES (?, ?, ?)`
    ).run(id, JSON.stringify(payload), payload.updatedAt);
  }

  private get<T>(table: "plots" | "open_loops" | "actions" | "required_inputs" | "conversations" | "conversation_operations", id: string, schema: { parse(value: unknown): T }): T | null {
    const row = this.database.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(id) as JsonRow | undefined;
    return row ? schema.parse(JSON.parse(row.payload)) : null;
  }

  private updatePayload(table: "review_runs", id: string, payload: unknown, status: string): void {
    const result = this.database.prepare(`UPDATE ${table} SET status = ?, payload = ? WHERE id = ?`)
      .run(status, JSON.stringify(payload), id);
    if (result.changes !== 1) throw new Error(`${table} record not found: ${id}`);
  }

  private list<T>(table: "plots", schema: { parse(value: unknown): T }): T[] {
    const rows = this.database.prepare(`SELECT payload FROM ${table} ORDER BY updated_at DESC`).all() as JsonRow[];
    return rows.map((row) => schema.parse(JSON.parse(row.payload)));
  }

  private listByPlot<T>(table: "open_loops" | "actions", plotId: string, schema: { parse(value: unknown): T }): T[] {
    const rows = this.database.prepare(
      `SELECT payload FROM ${table} WHERE plot_id = ? ORDER BY updated_at DESC`
    ).all(plotId) as JsonRow[];
    return rows.map((row) => schema.parse(JSON.parse(row.payload)));
  }
}
