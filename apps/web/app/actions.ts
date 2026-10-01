"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRequestTramaService } from "../lib/service";
import { nextGlobalReviewAt } from "@trama/core";
import { requireHostedUser } from "../lib/supabase/session";

const reviewIntervalHours = Number(process.env.TRAMA_REVIEW_INTERVAL_HOURS ?? "24");
const automaticNextReviewAt = () => nextGlobalReviewAt(new Date(), reviewIntervalHours);

function required(form: FormData, key: string): string {
  const value = String(form.get(key) ?? "").trim();
  if (!value) throw new Error(`Campo obrigatório: ${key}`);
  return value;
}

export async function createPlot(form: FormData) {
  await requireHostedUser();
  const plot = await (await getRequestTramaService()).createPlot({
    title: required(form, "title"),
    goal: required(form, "goal"),
    centralQuestion: required(form, "centralQuestion"),
    parentPlotId: null,
    lifecycleType: required(form, "lifecycleType") as "resolvable" | "ongoing"
  });
  redirect(`/?plot=${plot.id}`);
}

export async function setPlotLifecycleType(form: FormData) {
  await requireHostedUser();
  const plotId = required(form, "plotId");
  await (await getRequestTramaService()).setPlotLifecycleType({
    plotId,
    lifecycleType: required(form, "lifecycleType") as "resolvable" | "ongoing"
  });
  revalidatePath("/");
  redirect(`/?plot=${plotId}`);
}

export async function renamePlot(form: FormData) {
  await requireHostedUser();
  const plotId = required(form, "plotId");
  await (await getRequestTramaService()).renamePlot({ plotId, title: required(form, "title") });
  revalidatePath("/");
  redirect(`/?plot=${plotId}`);
}

export async function createOpenLoop(form: FormData) {
  await requireHostedUser();
  const plotId = required(form, "plotId");
  await (await getRequestTramaService()).createOpenLoop({
    plotId,
    title: required(form, "title"),
    description: String(form.get("description") ?? ""),
    requiresAction: String(form.get("requiresAction") ?? "true") === "true"
  });
  revalidatePath("/");
  redirect(`/?plot=${plotId}`);
}

export async function closeOpenLoop(form: FormData) {
  await requireHostedUser();
  const plotId = required(form, "plotId");
  await (await getRequestTramaService()).closeOpenLoop({
    openLoopId: required(form, "openLoopId"),
    status: required(form, "status") as "resolved" | "dismissed",
    resolution: required(form, "resolution")
  });
  revalidatePath("/");
  redirect(`/?plot=${plotId}`);
}

export async function setPlotVisibility(form: FormData) {
  await requireHostedUser();
  const plotId = required(form, "plotId");
  const visibility = required(form, "visibility") as "public" | "private";
  await (await getRequestTramaService()).setPlotVisibility({ plotId, visibility });
  revalidatePath("/");
  redirect(visibility === "private" ? "/" : `/?plot=${plotId}`);
}

export async function createAction(form: FormData) {
  await requireHostedUser();
  const plotId = required(form, "plotId");
  const openLoopId = String(form.get("openLoopId") ?? "") || null;
  const importance = required(form, "importance") as "low" | "medium" | "high" | "critical";
  const timing = required(form, "timing") as "flexible" | "soon" | "urgent";
  const impact = { low: 1, medium: 3, high: 4, critical: 5 }[importance];
  const urgency = { flexible: 1, soon: 3, urgent: 5 }[timing];
  await (await getRequestTramaService()).createAction({
    plotId,
    openLoopId,
    title: required(form, "title"),
    description: String(form.get("description") ?? ""),
    owner: required(form, "owner"),
    deadlineAt: new Date(required(form, "deadlineAt")).toISOString(),
    nextReviewAt: automaticNextReviewAt(),
    risk: {
      likelihood: 3,
      impact,
      urgency,
      description: String(form.get("riskDescription") ?? "")
    },
    manualPriorityAdjustment: 0
  });
  revalidatePath("/");
  redirect(`/?plot=${plotId}`);
}

export async function updateAction(form: FormData) {
  await requireHostedUser();
  const plotId = required(form, "plotId");
  const resolution = required(form, "resolution") as
    | "pending" | "inProgress" | "waiting" | "blocked" | "completed"
    | "failed" | "cancelled" | "delegated" | "noLongerNeeded";
  const terminal = ["completed", "failed", "cancelled", "noLongerNeeded"].includes(resolution);
  await (await getRequestTramaService()).recordActionUpdate({
    actionId: required(form, "actionId"),
    resolution,
    occurredAt: new Date().toISOString(),
    progress: required(form, "progress"),
    ...(!terminal ? { nextReviewAt: automaticNextReviewAt() } : {})
  });
  revalidatePath("/");
  redirect(`/?plot=${plotId}`);
}
