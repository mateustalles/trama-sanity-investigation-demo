import type {
  Action, ActionProgress, AttentionItem, AuditEvent, Notification, OpenLoop, Plot,
  RequiredInput, ReviewRun, Conversation, ConversationMessage, ConversationContext,
  ConversationOperation, ConversationEntityType
} from "@trama/schemas";

export interface TramaRepository {
  transaction<T>(operation: () => T): T;
  createPlot(plot: Plot): void;
  updatePlot(plot: Plot): void;
  getPlot(id: string): Plot | null;
  listPlots(): Plot[];
  createOpenLoop(openLoop: OpenLoop): void;
  updateOpenLoop(openLoop: OpenLoop): void;
  getOpenLoop(id: string): OpenLoop | null;
  listOpenLoops(plotId: string): OpenLoop[];
  createAction(action: Action): void;
  updateAction(action: Action): void;
  getAction(id: string): Action | null;
  listActions(plotId: string): Action[];
  appendActionProgress(progress: ActionProgress): void;
  listActionProgress(actionId: string): ActionProgress[];
  listPlotActionProgress(plotId: string): ActionProgress[];
  appendAuditEvent(event: AuditEvent): void;
  listAuditEvents(plotId: string): AuditEvent[];
  createReviewRun(reviewRun: ReviewRun): void;
  updateReviewRun(reviewRun: ReviewRun): void;
  getReviewRunByIdempotencyKey(idempotencyKey: string): ReviewRun | null;
  createAttentionItem(item: AttentionItem): void;
  updateAttentionItem(item: AttentionItem): void;
  getOpenAttentionItem(fingerprint: string): AttentionItem | null;
  listOpenAttentionItems(): AttentionItem[];
  createRequiredInput(input: RequiredInput): void;
  updateRequiredInput(input: RequiredInput): void;
  getRequiredInput(id: string): RequiredInput | null;
  getOpenRequiredInput(attentionItemId: string, key: string): RequiredInput | null;
  listOpenRequiredInputs(plotId: string): RequiredInput[];
  createNotification(notification: Notification): void;
  updateNotification(notification: Notification): void;
  getNotificationByDedupeKey(dedupeKey: string): Notification | null;
  listPendingNotifications(now: string, limit: number): Notification[];
  createConversation(conversation: Conversation): void;
  updateConversation(conversation: Conversation): void;
  getConversation(id: string): Conversation | null;
  listConversations(entityType: ConversationEntityType, entityId: string): Conversation[];
  appendConversationMessage(message: ConversationMessage): void;
  listConversationMessages(conversationId: string): ConversationMessage[];
  createConversationContext(context: ConversationContext): void;
  listConversationContexts(conversationId: string): ConversationContext[];
  createConversationOperation(operation: ConversationOperation): void;
  updateConversationOperation(operation: ConversationOperation): void;
  getConversationOperation(id: string): ConversationOperation | null;
  listConversationOperations(conversationId: string): ConversationOperation[];
}

type PromisifyRepository<T> = {
  [Key in keyof T]: T[Key] extends (...arguments_: infer Arguments) => infer Result
    ? (...arguments_: Arguments) => Promise<Result>
    : never;
};

/** Async persistence boundary used by hosted adapters. */
export type AsyncTramaRepository = Omit<PromisifyRepository<TramaRepository>, "transaction"> & {
  transaction<T>(operation: () => Promise<T>): Promise<T>;
};

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface ActorContext {
  type: "user" | "system" | "agent";
  id: string;
}
