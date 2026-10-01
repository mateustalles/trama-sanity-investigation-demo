import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { AsyncTramaService } from "../packages/application/src/index.ts";
import { PostgresTramaRepository } from "../packages/database/src/index.ts";

const root = resolve(import.meta.dirname, "..");
const lines = readFileSync(resolve(root, "apps/web/.env.local"), "utf8").split(/\r?\n/);
const value = (name: string) => lines.find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1).trim();
const connectionString = value("SUPABASE_DATABASE_URL");
const supabaseUrl = value("NEXT_PUBLIC_SUPABASE_URL");
const secretKey = value("SUPABASE_SECRET_KEY");
if (!connectionString || !supabaseUrl || !secretKey) throw new Error("Hosted database configuration is incomplete.");
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: workspace, error } = await admin.from("workspaces").select("id").order("created_at").limit(1).single();
if (error || !workspace) throw new Error(error?.message ?? "No hosted Workspace found.");

const repository = new PostgresTramaRepository(connectionString, workspace.id);
const sql = postgres(connectionString, { max: 1, prepare: true });
try {
  const service = new AsyncTramaService(
    repository,
    { now: () => new Date() },
    { next: () => crypto.randomUUID() },
    { type: "system", id: "hosted-verification" }
  );
  const plots = await service.listPlots();
  const firstDashboard = plots[0] ? await service.getPlotDashboard(plots[0].id) : null;
  const report = await service.getOperationalPriorityReport();
  const [membership] = await sql<Array<{ user_id: string }>>`
    select user_id from workspace_members where workspace_id = ${workspace.id} limit 1
  `;
  if (!membership) throw new Error("The hosted Workspace has no member.");
  const visibleToOwner = await sql.begin(async (transaction) => {
    await transaction`set local role authenticated`;
    await transaction`select set_config('request.jwt.claims', ${JSON.stringify({ sub: membership.user_id })}, true)`;
    const [row] = await transaction<Array<{ count: number }>>`select count(*)::int as count from plots`;
    return row?.count ?? 0;
  });
  const visibleToStranger = await sql.begin(async (transaction) => {
    await transaction`set local role authenticated`;
    await transaction`select set_config('request.jwt.claims', ${JSON.stringify({ sub: crypto.randomUUID() })}, true)`;
    const [row] = await transaction<Array<{ count: number }>>`select count(*)::int as count from plots`;
    return row?.count ?? 0;
  });
  if (visibleToOwner !== plots.length || visibleToStranger !== 0) {
    throw new Error(`Workspace isolation failed (owner=${visibleToOwner}, stranger=${visibleToStranger}).`);
  }
  console.log(JSON.stringify({
    connected: true,
    plots: plots.length,
    firstDashboardActions: firstDashboard?.actions.length ?? 0,
    priorityEntries: report.entries.length,
    workspaceIsolation: true
  }));
} finally {
  await repository.close();
  await sql.end();
}
