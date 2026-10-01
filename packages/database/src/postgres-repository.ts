import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import type { AsyncTramaRepository } from "@trama/core";
import {
  actionProgressSchema, actionSchema, attentionItemSchema, auditEventSchema,
  conversationContextSchema, conversationMessageSchema, conversationOperationSchema,
  conversationSchema, notificationSchema, openLoopSchema, plotSchema,
  requiredInputSchema, reviewRunSchema,
  type Action, type ActionProgress, type AttentionItem, type AuditEvent,
  type Conversation, type ConversationContext, type ConversationEntityType,
  type ConversationMessage, type ConversationOperation, type Notification,
  type OpenLoop, type Plot, type RequiredInput, type ReviewRun
} from "@trama/schemas";

type QueryClient = ReturnType<typeof postgres>;
type PayloadSchema<T> = { parse(value: unknown): T };
type PayloadRow = { payload: unknown };

export class PostgresTramaRepository implements AsyncTramaRepository {
  private readonly sql: QueryClient;
  private readonly transactionContext = new AsyncLocalStorage<QueryClient>();

  constructor(connectionString: string, private readonly workspaceId: string) {
    if (!workspaceId) throw new Error("A Workspace is required for hosted persistence.");
    this.sql = postgres(connectionString, { max: 10, prepare: true });
  }

  async close(): Promise<void> { await this.sql.end(); }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const result = await this.sql.begin(async (transaction) =>
      this.transactionContext.run(transaction as unknown as QueryClient, operation));
    return result as T;
  }

  async createPlot(item: Plot): Promise<void> {
    const sql = this.query();
    await sql`insert into plots ${sql(this.plotRow(item))}`;
  }
  async updatePlot(item: Plot): Promise<void> { await this.update("plots", item.id, this.plotRow(item)); }
  async getPlot(id: string): Promise<Plot | null> { return this.get("plots", id, plotSchema); }
  async listPlots(): Promise<Plot[]> { return this.list("plots", plotSchema, "updated_at desc"); }

  async createOpenLoop(item: OpenLoop): Promise<void> {
    const sql = this.query();
    await sql`insert into open_loops ${sql(this.openLoopRow(item))}`;
  }
  async updateOpenLoop(item: OpenLoop): Promise<void> { await this.update("open_loops", item.id, this.openLoopRow(item)); }
  async getOpenLoop(id: string): Promise<OpenLoop | null> { return this.get("open_loops", id, openLoopSchema); }
  async listOpenLoops(plotId: string): Promise<OpenLoop[]> {
    return this.listWhere("open_loops", "plot_id", plotId, openLoopSchema, "updated_at desc");
  }

  async createAction(item: Action): Promise<void> {
    const sql = this.query();
    await sql`insert into actions ${sql(this.actionRow(item))}`;
  }
  async updateAction(item: Action): Promise<void> { await this.update("actions", item.id, this.actionRow(item)); }
  async getAction(id: string): Promise<Action | null> { return this.get("actions", id, actionSchema); }
  async listActions(plotId: string): Promise<Action[]> {
    return this.listWhere("actions", "plot_id", plotId, actionSchema, "updated_at desc");
  }

  async appendActionProgress(item: ActionProgress): Promise<void> {
    await this.insert("action_progress", {
      workspace_id: this.workspaceId, id: item.id, plot_id: item.plotId,
      action_id: item.actionId, occurred_at: item.occurredAt, payload: this.json(item)
    });
  }
  async listActionProgress(actionId: string): Promise<ActionProgress[]> {
    return this.listWhere("action_progress", "action_id", actionId, actionProgressSchema, "occurred_at");
  }
  async listPlotActionProgress(plotId: string): Promise<ActionProgress[]> {
    return this.listWhere("action_progress", "plot_id", plotId, actionProgressSchema, "occurred_at");
  }

  async appendAuditEvent(item: AuditEvent): Promise<void> {
    await this.insert("audit_events", {
      workspace_id: this.workspaceId, id: item.id, plot_id: item.plotId,
      entity_id: item.entityId, occurred_at: item.occurredAt, payload: this.json(item)
    });
  }
  async listAuditEvents(plotId: string): Promise<AuditEvent[]> {
    return this.listWhere("audit_events", "plot_id", plotId, auditEventSchema, "occurred_at desc");
  }

  async createReviewRun(item: ReviewRun): Promise<void> {
    await this.insert("review_runs", this.reviewRunRow(item));
  }
  async updateReviewRun(item: ReviewRun): Promise<void> { await this.update("review_runs", item.id, this.reviewRunRow(item)); }
  async getReviewRunByIdempotencyKey(key: string): Promise<ReviewRun | null> {
    return this.getBy("review_runs", "idempotency_key", key, reviewRunSchema);
  }

  async createAttentionItem(item: AttentionItem): Promise<void> { await this.insert("attention_items", this.attentionRow(item)); }
  async updateAttentionItem(item: AttentionItem): Promise<void> { await this.update("attention_items", item.id, this.attentionRow(item)); }
  async getOpenAttentionItem(fingerprint: string): Promise<AttentionItem | null> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from attention_items
      where workspace_id = ${this.workspaceId} and fingerprint = ${fingerprint}
        and status in ('open', 'acknowledged') limit 1`;
    return rows[0] ? attentionItemSchema.parse(rows[0].payload) : null;
  }
  async listOpenAttentionItems(): Promise<AttentionItem[]> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from attention_items
      where workspace_id = ${this.workspaceId} and status in ('open', 'acknowledged')`;
    return rows.map((row) => attentionItemSchema.parse(row.payload));
  }

  async createRequiredInput(item: RequiredInput): Promise<void> { await this.insert("required_inputs", this.requiredInputRow(item)); }
  async updateRequiredInput(item: RequiredInput): Promise<void> { await this.update("required_inputs", item.id, this.requiredInputRow(item)); }
  async getRequiredInput(id: string): Promise<RequiredInput | null> { return this.get("required_inputs", id, requiredInputSchema); }
  async getOpenRequiredInput(attentionItemId: string, key: string): Promise<RequiredInput | null> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from required_inputs
      where workspace_id = ${this.workspaceId} and attention_item_id = ${attentionItemId}
        and input_key = ${key} and status = 'open' limit 1`;
    return rows[0] ? requiredInputSchema.parse(rows[0].payload) : null;
  }
  async listOpenRequiredInputs(plotId: string): Promise<RequiredInput[]> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from required_inputs
      where workspace_id = ${this.workspaceId} and plot_id = ${plotId} and status = 'open'
      order by updated_at`;
    return rows.map((row) => requiredInputSchema.parse(row.payload));
  }

  async createNotification(item: Notification): Promise<void> { await this.insert("notifications", this.notificationRow(item)); }
  async updateNotification(item: Notification): Promise<void> { await this.update("notifications", item.id, this.notificationRow(item)); }
  async getNotificationByDedupeKey(key: string): Promise<Notification | null> {
    return this.getBy("notifications", "dedupe_key", key, notificationSchema);
  }
  async listPendingNotifications(now: string, limit: number): Promise<Notification[]> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from notifications
      where workspace_id = ${this.workspaceId} and status in ('pending', 'failed')
        and next_attempt_at <= ${now} order by next_attempt_at limit ${limit}`;
    return rows.map((row) => notificationSchema.parse(row.payload));
  }

  async createConversation(item: Conversation): Promise<void> { await this.insert("conversations", this.conversationRow(item)); }
  async updateConversation(item: Conversation): Promise<void> { await this.update("conversations", item.id, this.conversationRow(item)); }
  async getConversation(id: string): Promise<Conversation | null> { return this.get("conversations", id, conversationSchema); }
  async listConversations(entityType: ConversationEntityType, entityId: string): Promise<Conversation[]> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from conversations
      where workspace_id = ${this.workspaceId} and entity_type = ${entityType}
        and entity_id = ${entityId} order by updated_at desc`;
    return rows.map((row) => conversationSchema.parse(row.payload));
  }
  async appendConversationMessage(item: ConversationMessage): Promise<void> {
    await this.insert("conversation_messages", {
      workspace_id: this.workspaceId, id: item.id, conversation_id: item.conversationId,
      created_at: item.createdAt, payload: this.json(item)
    });
  }
  async listConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    return this.listWhere("conversation_messages", "conversation_id", conversationId, conversationMessageSchema, "created_at");
  }
  async createConversationContext(item: ConversationContext): Promise<void> {
    const sql = this.query();
    await sql`insert into conversation_contexts ${sql({
      workspace_id: this.workspaceId, id: item.id, conversation_id: item.conversationId,
      entity_type: item.entityType, entity_id: item.entityId, relation: item.relation,
      created_at: item.createdAt, payload: this.json(item)
    })} on conflict (workspace_id, conversation_id, entity_type, entity_id, relation) do nothing`;
  }
  async listConversationContexts(conversationId: string): Promise<ConversationContext[]> {
    return this.listWhere("conversation_contexts", "conversation_id", conversationId, conversationContextSchema, "created_at");
  }
  async createConversationOperation(item: ConversationOperation): Promise<void> { await this.insert("conversation_operations", this.operationRow(item)); }
  async updateConversationOperation(item: ConversationOperation): Promise<void> { await this.update("conversation_operations", item.id, this.operationRow(item)); }
  async getConversationOperation(id: string): Promise<ConversationOperation | null> { return this.get("conversation_operations", id, conversationOperationSchema); }
  async listConversationOperations(conversationId: string): Promise<ConversationOperation[]> {
    return this.listWhere("conversation_operations", "conversation_id", conversationId, conversationOperationSchema, "created_at");
  }

  private query(): QueryClient { return this.transactionContext.getStore() ?? this.sql; }
  private json(value: unknown) { return this.query().json(value as never); }
  private async insert(table: string, row: Record<string, unknown>) {
    const sql = this.query();
    await sql`insert into ${sql(table)} ${sql(row)}`;
  }
  private async update(table: string, id: string, row: Record<string, unknown>) {
    const sql = this.query();
    const result = await sql`update ${sql(table)} set ${sql(row)}
      where workspace_id = ${this.workspaceId} and id = ${id}`;
    if (result.count !== 1) throw new Error(`${table} record not found: ${id}`);
  }
  private async get<T>(table: string, id: string, schema: PayloadSchema<T>): Promise<T | null> {
    return this.getBy(table, "id", id, schema);
  }
  private async getBy<T>(table: string, column: string, value: string, schema: PayloadSchema<T>): Promise<T | null> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from ${sql(table)}
      where workspace_id = ${this.workspaceId} and ${sql(column)} = ${value} limit 1`;
    return rows[0] ? schema.parse(rows[0].payload) : null;
  }
  private async list<T>(table: string, schema: PayloadSchema<T>, order: string): Promise<T[]> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from ${sql(table)}
      where workspace_id = ${this.workspaceId} order by ${sql.unsafe(order)}`;
    return rows.map((row) => schema.parse(row.payload));
  }
  private async listWhere<T>(table: string, column: string, value: string, schema: PayloadSchema<T>, order: string): Promise<T[]> {
    const sql = this.query();
    const rows = await sql<PayloadRow[]>`select payload from ${sql(table)}
      where workspace_id = ${this.workspaceId} and ${sql(column)} = ${value}
      order by ${sql.unsafe(order)}`;
    return rows.map((row) => schema.parse(row.payload));
  }
  private plotRow(item: Plot) { return { workspace_id: this.workspaceId, id: item.id, parent_plot_id: item.parentPlotId, status: item.status, visibility: item.visibility, updated_at: item.updatedAt, payload: this.json(item) }; }
  private openLoopRow(item: OpenLoop) { return { workspace_id: this.workspaceId, id: item.id, plot_id: item.plotId, status: item.status, updated_at: item.updatedAt, payload: this.json(item) }; }
  private actionRow(item: Action) { return { workspace_id: this.workspaceId, id: item.id, plot_id: item.plotId, open_loop_id: item.openLoopId, resolution: item.resolution, deadline_at: item.deadlineAt, next_review_at: item.nextReviewAt, updated_at: item.updatedAt, payload: this.json(item) }; }
  private reviewRunRow(item: ReviewRun) { return { workspace_id: this.workspaceId, id: item.id, idempotency_key: item.idempotencyKey, status: item.status, started_at: item.startedAt, payload: this.json(item) }; }
  private attentionRow(item: AttentionItem) { return { workspace_id: this.workspaceId, id: item.id, plot_id: item.plotId, fingerprint: item.fingerprint, status: item.status, updated_at: item.lastDetectedAt, payload: this.json(item) }; }
  private requiredInputRow(item: RequiredInput) { return { workspace_id: this.workspaceId, id: item.id, plot_id: item.plotId, attention_item_id: item.attentionItemId, input_key: item.key, status: item.status, updated_at: item.answeredAt ?? item.dismissedAt ?? item.createdAt, payload: this.json(item) }; }
  private notificationRow(item: Notification) { return { workspace_id: this.workspaceId, id: item.id, plot_id: item.plotId, dedupe_key: item.dedupeKey, status: item.status, next_attempt_at: item.nextAttemptAt, payload: this.json(item) }; }
  private conversationRow(item: Conversation) { return { workspace_id: this.workspaceId, id: item.id, entity_type: item.primaryEntityType, entity_id: item.primaryEntityId, status: item.status, updated_at: item.updatedAt, payload: this.json(item) }; }
  private operationRow(item: ConversationOperation) { return { workspace_id: this.workspaceId, id: item.id, conversation_id: item.conversationId, status: item.status, created_at: item.createdAt, payload: this.json(item) }; }
}
