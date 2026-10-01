import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./server";
import { currentHostedUser } from "./session";
import { isDemoJudge } from "./demo-judge";

export interface HostedWorkspaceContext {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "member";
}

export async function currentHostedWorkspace(): Promise<HostedWorkspaceContext | null> {
  const user = await currentHostedUser();
  if (!user || isDemoJudge(user)) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível identificar o Workspace: ${error.message}`);
  if (!data) return null;
  return {
    userId: user.id,
    workspaceId: data.workspace_id,
    role: data.role as HostedWorkspaceContext["role"]
  };
}

export async function requireHostedWorkspace(): Promise<HostedWorkspaceContext> {
  const context = await currentHostedWorkspace();
  if (!context) redirect("/login?error=workspace");
  return context;
}
