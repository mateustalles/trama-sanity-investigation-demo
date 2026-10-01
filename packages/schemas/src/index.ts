import { z } from "zod";

export const idSchema = z.string().min(1);
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const plotStatusSchema = z.enum(["active", "completed", "archived"]);
export const plotVisibilitySchema = z.enum(["public", "private"]);
export const plotLifecycleTypeSchema = z.enum(["resolvable", "ongoing"]);

export const plotSchema = z.object({
  id: idSchema,
  parentPlotId: idSchema.nullable(),
  title: z.string().min(1).max(160),
  goal: z.string().min(1),
  centralQuestion: z.string().min(1),
  status: plotStatusSchema,
  visibility: plotVisibilitySchema.default("public"),
  lifecycleType: plotLifecycleTypeSchema.default("resolvable"),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const createPlotInputSchema = plotSchema.pick({
  title: true,
  goal: true,
  centralQuestion: true
}).extend({
  parentPlotId: idSchema.nullable().default(null),
  lifecycleType: plotLifecycleTypeSchema.default("resolvable")
});

export const openLoopStatusSchema = z.enum(["open", "resolved", "dismissed"]);

export const openLoopSchema = z.object({
  id: idSchema,
  plotId: idSchema,
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  requiresAction: z.boolean().default(true),
  status: openLoopStatusSchema,
  resolution: z.string().nullable().default(null),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable()
});

export const reparentPlotInputSchema = z.object({
  plotId: idSchema,
  parentPlotId: idSchema.nullable()
});

export const renamePlotInputSchema = z.object({
  plotId: idSchema,
  title: plotSchema.shape.title
});

export const setPlotVisibilityInputSchema = z.object({
  plotId: idSchema,
  visibility: plotVisibilitySchema
});

export const setPlotStatusInputSchema = z.object({
  plotId: idSchema,
  status: plotStatusSchema
});

export const setPlotLifecycleTypeInputSchema = z.object({
  plotId: idSchema,
  lifecycleType: plotLifecycleTypeSchema
});

export const createOpenLoopInputSchema = openLoopSchema.pick({
  plotId: true,
  title: true,
  requiresAction: true
}).extend({ description: z.string().default("") });

export const closeOpenLoopInputSchema = z.object({
  openLoopId: idSchema,
  status: z.enum(["resolved", "dismissed"]),
  resolution: z.string().min(1)
});

export const actionResolutionSchema = z.enum([
  "pending",
  "inProgress",
  "waiting",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "delegated",
  "noLongerNeeded"
]);

export const riskAssessmentSchema = z.object({
  likelihood: z.number().int().min(0).max(5),
  impact: z.number().int().min(0).max(5),
  urgency: z.number().int().min(0).max(5),
  description: z.string().default("")
});

export const priorityReasonSchema = z.object({
  code: z.enum([
    "deadlineOverdue",
    "deadlineSoon",
    "highImpact",
    "highLikelihood",
    "highUrgency",
    "blocked",
    "stale",
    "manualAdjustment"
  ]),
  label: z.string(),
  contribution: z.number()
});

export const priorityAssessmentSchema = z.object({
  calculatedPriority: z.number().int().min(0).max(100),
  effectivePriority: z.number().int().min(0).max(100),
  reasons: z.array(priorityReasonSchema),
  calculatedAt: isoDateTimeSchema
});

export const actionSchema = z.object({
  id: idSchema,
  plotId: idSchema,
  openLoopId: idSchema.nullable(),
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  resolution: actionResolutionSchema,
  owner: z.string().min(1),
  deadlineAt: isoDateTimeSchema.nullable(),
  nextReviewAt: isoDateTimeSchema,
  risk: riskAssessmentSchema,
  manualPriorityAdjustment: z.number().int().min(-100).max(100).default(0),
  priority: priorityAssessmentSchema,
  outcome: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable()
});

export const actionProgressSchema = z.object({
  id: idSchema,
  plotId: idSchema,
  actionId: idSchema,
  description: z.string().trim().min(1),
  resolutionAfter: actionResolutionSchema,
  actorType: z.enum(["user", "system", "agent"]),
  actorId: z.string().min(1),
  occurredAt: isoDateTimeSchema
});

export const createActionInputSchema = actionSchema.pick({
  plotId: true,
  title: true,
  owner: true,
  deadlineAt: true,
  nextReviewAt: true,
  risk: true
}).extend({
  openLoopId: idSchema.nullable().default(null),
  description: z.string().default(""),
  deadlineAt: isoDateTimeSchema,
  manualPriorityAdjustment: z.number().int().min(-100).max(100).default(0)
});

export const recordActionUpdateInputSchema = z.object({
  actionId: idSchema,
  resolution: actionResolutionSchema,
  occurredAt: isoDateTimeSchema,
  progress: z.string().trim().min(1),
  deadlineAt: isoDateTimeSchema.nullable().optional(),
  nextReviewAt: isoDateTimeSchema.optional(),
  risk: riskAssessmentSchema.optional()
}).superRefine((value, context) => {
  const remainsActive = ["pending", "inProgress", "waiting", "blocked", "delegated"].includes(value.resolution);
  if (remainsActive && !value.nextReviewAt) {
    context.addIssue({
      code: "custom",
      path: ["nextReviewAt"],
      message: "An active Action update requires a next review date."
    });
  }
});

export const recordActionStepInputSchema = z.object({
  actionId: idSchema,
  progress: z.string().trim().min(1),
  occurredAt: isoDateTimeSchema
});

export const renameActionInputSchema = z.object({
  actionId: idSchema,
  title: actionSchema.shape.title,
  occurredAt: isoDateTimeSchema
});

export const rescheduleActionInputSchema = z.object({
  actionId: idSchema,
  deadlineAt: isoDateTimeSchema,
  occurredAt: isoDateTimeSchema
});

export const auditEventSchema = z.object({
  id: idSchema,
  plotId: idSchema.nullable(),
  entityType: z.enum([
    "plot", "openLoop", "action", "reviewRun", "attentionItem",
    "requiredInput", "notification", "actionProgress", "conversation",
    "conversationMessage", "conversationOperation", "conversationContext"
  ]),
  entityId: idSchema,
  eventType: z.string().min(1),
  actorType: z.enum(["user", "system", "agent"]),
  actorId: z.string().min(1),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  occurredAt: isoDateTimeSchema
});

export const reviewTriggerSchema = z.enum(["scheduled", "change", "manual"]);
export const reviewRunStatusSchema = z.enum(["running", "completed", "failed"]);
export const reviewRunSchema = z.object({
  id: idSchema,
  idempotencyKey: z.string().min(1),
  trigger: reviewTriggerSchema,
  policyVersion: z.string().min(1),
  status: reviewRunStatusSchema,
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  reviewedCount: z.number().int().nonnegative(),
  changedCount: z.number().int().nonnegative(),
  attentionCount: z.number().int().nonnegative(),
  requiredInputCount: z.number().int().nonnegative(),
  notificationCount: z.number().int().nonnegative(),
  error: z.string().nullable()
});

export const runOperationalReviewInputSchema = z.object({
  trigger: reviewTriggerSchema.default("manual"),
  idempotencyKey: z.string().min(1).optional()
});

export const attentionKindSchema = z.enum([
  "deadlineOverdue", "reviewDue", "blocked", "highRisk", "waitingStale"
]);
export const attentionSeveritySchema = z.enum(["info", "warning", "critical"]);
export const attentionStatusSchema = z.enum(["open", "acknowledged", "dismissed", "resolved"]);
export const attentionItemSchema = z.object({
  id: idSchema,
  plotId: idSchema,
  reviewRunId: idSchema,
  entityType: z.enum(["plot", "openLoop", "action"]),
  entityId: idSchema,
  kind: attentionKindSchema,
  severity: attentionSeveritySchema,
  summary: z.string().min(1),
  reasons: z.array(z.string().min(1)).min(1),
  fingerprint: z.string().min(1),
  status: attentionStatusSchema,
  firstDetectedAt: isoDateTimeSchema,
  lastDetectedAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable()
});

export const requiredInputStatusSchema = z.enum(["open", "answered", "dismissed"]);
export const requiredInputSchema = z.object({
  id: idSchema,
  plotId: idSchema,
  attentionItemId: idSchema,
  targetEntityType: z.enum(["plot", "openLoop", "action"]),
  targetEntityId: idSchema,
  key: z.string().min(1),
  question: z.string().min(1),
  expectedType: z.enum(["text", "dateTime", "choice", "json", "actionUpdate"]),
  blocking: z.boolean(),
  status: requiredInputStatusSchema,
  answer: z.unknown().nullable(),
  createdAt: isoDateTimeSchema,
  answeredAt: isoDateTimeSchema.nullable(),
  dismissedAt: isoDateTimeSchema.nullable()
});

export const answerRequiredInputSchema = z.object({
  requiredInputId: idSchema,
  answer: z.unknown().refine((value) => value !== null && value !== undefined, "Answer is required."),
  occurredAt: isoDateTimeSchema
});

export const notificationStatusSchema = z.enum([
  "pending", "processing", "delivered", "failed", "deadLetter", "cancelled"
]);
export const notificationSchema = z.object({
  id: idSchema,
  plotId: idSchema,
  attentionItemId: idSchema,
  requiredInputId: idSchema.nullable(),
  deliveryClass: z.enum(["immediate", "briefing"]),
  dedupeKey: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  data: z.unknown(),
  status: notificationStatusSchema,
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  deliveredAt: isoDateTimeSchema.nullable(),
  lastError: z.string().nullable()
});

export const operationalBriefingSchema = z.object({
  summary: z.string().min(1),
  priorities: z.array(z.object({
    rank: z.number().int().positive(),
    plotId: idSchema,
    title: z.string().min(1),
    why: z.string().min(1),
    nextStep: z.string().min(1),
    deadlineAt: isoDateTimeSchema.nullable()
  })).max(5),
  overdue: z.array(z.object({
    plotId: idSchema,
    title: z.string().min(1),
    dueAt: isoDateTimeSchema,
    reason: z.string().min(1)
  })),
  questions: z.array(z.object({
    plotId: idSchema,
    question: z.string().min(1)
  })),
  canWait: z.array(z.object({
    plotId: idSchema,
    title: z.string().min(1),
    reason: z.string().min(1)
  }))
});

export const priorityReportEntrySchema = z.object({
  kind: z.enum(["action", "openLoop"]),
  entityId: idSchema,
  plotId: idSchema,
  plotTitle: z.string().min(1),
  tramaId: idSchema,
  tramaTitle: z.string().min(1),
  title: z.string().min(1),
  band: z.enum(["high", "medium", "low", "context"]),
  score: z.number().int().min(0).max(100).nullable(),
  deadlineAt: isoDateTimeSchema.nullable(),
  deadlineStatus: z.enum(["overdue", "dueSoon", "scheduled", "none"]),
  reasons: z.array(z.string().min(1))
});

export const operationalPriorityReportSchema = z.object({
  generatedAt: isoDateTimeSchema,
  counts: z.object({
    actions: z.number().int().nonnegative(),
    openLoops: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
    context: z.number().int().nonnegative()
  }),
  entries: z.array(priorityReportEntrySchema)
});

export const conversationEntityTypeSchema = z.enum(["workspace", "plot", "openLoop", "action"]);
export const conversationMemoryScopeSchema = z.enum([
  "currentConversation", "sameEntity", "relatedContext", "global"
]);
export const conversationSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(160),
  primaryEntityType: conversationEntityTypeSchema,
  primaryEntityId: idSchema,
  memoryScope: conversationMemoryScopeSchema.default("sameEntity"),
  status: z.enum(["active", "archived"]),
  sourceClient: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export const conversationMessageSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().min(1),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: isoDateTimeSchema
});
export const conversationContextSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  entityType: conversationEntityTypeSchema,
  entityId: idSchema,
  relation: z.enum(["primary", "mentioned", "related", "retrieved"]),
  createdAt: isoDateTimeSchema
});
export const conversationOperationSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  messageId: idSchema.nullable(),
  toolName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  status: z.enum(["proposed", "approved", "declined", "executed", "failed"]),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable()
});

// A resolved workflow is derived from an authoritative entity at request time.
// It is intentionally not a persisted entity: persisted status remains the source
// of truth and the server recomputes allowed operations before every write.
export const workflowLocaleSchema = z.enum(["pt-BR", "en-US"]);
export const workflowEntityTypeSchema = z.enum(["plot", "openLoop", "action"]);
export const workflowOperationSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  requiredFields: z.array(z.string().min(1)),
  label: z.string().min(1),
  prompt: z.string().min(1),
  confirmation: z.string().min(1)
});
export const entityWorkflowSchema = z.object({
  entityType: workflowEntityTypeSchema,
  entityId: idSchema,
  entityTitle: z.string().min(1),
  state: z.string().min(1),
  operations: z.array(workflowOperationSchema)
});

export const createConversationInputSchema = conversationSchema.pick({
  title: true, primaryEntityType: true, primaryEntityId: true, memoryScope: true, sourceClient: true
});
export const appendConversationMessageInputSchema = conversationMessageSchema.pick({
  conversationId: true, role: true, content: true, provider: true, model: true
});
export const setConversationMemoryScopeInputSchema = conversationSchema.pick({ id: true, memoryScope: true });

export type Plot = z.infer<typeof plotSchema>;
export type CreatePlotInput = z.input<typeof createPlotInputSchema>;
export type ReparentPlotInput = z.input<typeof reparentPlotInputSchema>;
export type RenamePlotInput = z.input<typeof renamePlotInputSchema>;
export type SetPlotVisibilityInput = z.input<typeof setPlotVisibilityInputSchema>;
export type SetPlotStatusInput = z.input<typeof setPlotStatusInputSchema>;
export type SetPlotLifecycleTypeInput = z.input<typeof setPlotLifecycleTypeInputSchema>;
export type OpenLoop = z.infer<typeof openLoopSchema>;
export type CreateOpenLoopInput = z.input<typeof createOpenLoopInputSchema>;
export type CloseOpenLoopInput = z.input<typeof closeOpenLoopInputSchema>;
export type Action = z.infer<typeof actionSchema>;
export type ActionProgress = z.infer<typeof actionProgressSchema>;
export type CreateActionInput = z.input<typeof createActionInputSchema>;
export type RecordActionUpdateInput = z.input<typeof recordActionUpdateInputSchema>;
export type RecordActionStepInput = z.input<typeof recordActionStepInputSchema>;
export type RenameActionInput = z.input<typeof renameActionInputSchema>;
export type RescheduleActionInput = z.input<typeof rescheduleActionInputSchema>;
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;
export type PriorityAssessment = z.infer<typeof priorityAssessmentSchema>;
export type PriorityReason = z.infer<typeof priorityReasonSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type ReviewRun = z.infer<typeof reviewRunSchema>;
export type RunOperationalReviewInput = z.input<typeof runOperationalReviewInputSchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type RequiredInput = z.infer<typeof requiredInputSchema>;
export type AnswerRequiredInput = z.input<typeof answerRequiredInputSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type OperationalBriefing = z.infer<typeof operationalBriefingSchema>;
export type PriorityReportEntry = z.infer<typeof priorityReportEntrySchema>;
export type OperationalPriorityReport = z.infer<typeof operationalPriorityReportSchema>;
export type ConversationEntityType = z.infer<typeof conversationEntityTypeSchema>;
export type ConversationMemoryScope = z.infer<typeof conversationMemoryScopeSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationContext = z.infer<typeof conversationContextSchema>;
export type ConversationOperation = z.infer<typeof conversationOperationSchema>;
export type WorkflowLocale = z.infer<typeof workflowLocaleSchema>;
export type WorkflowEntityType = z.infer<typeof workflowEntityTypeSchema>;
export type WorkflowOperation = z.infer<typeof workflowOperationSchema>;
export type EntityWorkflow = z.infer<typeof entityWorkflowSchema>;
export type CreateConversationInput = z.input<typeof createConversationInputSchema>;
export type AppendConversationMessageInput = z.input<typeof appendConversationMessageInputSchema>;
export type SetConversationMemoryScopeInput = z.input<typeof setConversationMemoryScopeInputSchema>;
