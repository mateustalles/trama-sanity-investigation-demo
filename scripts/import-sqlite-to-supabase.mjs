import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";

const confirmed = process.argv.includes("--confirm-import");
const repositoryRoot = resolve(import.meta.dirname, "..");

function readEnvironmentFile(filename) {
  if (!existsSync(filename)) return {};
  return Object.fromEntries(readFileSync(filename, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      return [line.slice(0, separator).trim(), value];
    }));
}

const fileEnvironment = readEnvironmentFile(resolve(repositoryRoot, "apps/web/.env.local"));
const environment = { ...fileEnvironment, ...process.env };
const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = environment.SUPABASE_SECRET_KEY;
const targetEmail = environment.TRAMA_IMPORT_USER_EMAIL ?? environment.TRAMA_ADMIN_EMAILS?.split(",")[0]?.trim();
const databasePath = resolve(environment.TRAMA_DATABASE_PATH ?? resolve(repositoryRoot, ".trama/trama.db"));

if (!supabaseUrl || !secretKey) throw new Error("Supabase URL and secret key are required.");
if (!targetEmail) throw new Error("Set TRAMA_IMPORT_USER_EMAIL or TRAMA_ADMIN_EMAILS.");
if (!existsSync(databasePath)) throw new Error(`SQLite database not found: ${databasePath}`);

const client = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: userPage, error: userError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (userError) throw userError;
const targetUser = userPage.users.find((user) => user.email?.toLowerCase() === targetEmail.toLowerCase());
if (!targetUser) throw new Error(`Hosted user not found: ${targetEmail}`);

const { data: membership, error: membershipError } = await client.from("workspace_members")
  .select("workspace_id, role").eq("user_id", targetUser.id).eq("role", "owner").limit(1).maybeSingle();
if (membershipError) throw membershipError;
if (!membership) throw new Error(`No owned Workspace found for: ${targetEmail}`);

const database = new DatabaseSync(databasePath, { readOnly: true });
const tableNames = database.prepare("select name from sqlite_master where type = 'table'").all().map((row) => row.name);
const payloads = (name) => tableNames.includes(name)
  ? database.prepare(`select payload from ${name}`).all().map((row) => JSON.parse(row.payload))
  : [];
const definitions = [
  ["plots", (item) => ({
    id: item.id,
    parent_plot_id: item.parentPlotId ?? null,
    status: item.status,
    // Records created before Plot visibility existed are public by domain default.
    visibility: item.visibility ?? "public",
    updated_at: item.updatedAt
  })],
  ["open_loops", (item) => ({ id: item.id, plot_id: item.plotId, status: item.status, updated_at: item.updatedAt })],
  ["actions", (item) => ({ id: item.id, plot_id: item.plotId, open_loop_id: item.openLoopId, resolution: item.resolution, deadline_at: item.deadlineAt, next_review_at: item.nextReviewAt, updated_at: item.updatedAt })],
  ["action_progress", (item) => ({ id: item.id, plot_id: item.plotId, action_id: item.actionId, occurred_at: item.occurredAt })],
  ["audit_events", (item) => ({ id: item.id, plot_id: item.plotId, entity_id: item.entityId, occurred_at: item.occurredAt })],
  ["review_runs", (item) => ({ id: item.id, idempotency_key: item.idempotencyKey, status: item.status, started_at: item.startedAt })],
  ["attention_items", (item) => ({ id: item.id, plot_id: item.plotId, fingerprint: item.fingerprint, status: item.status, updated_at: item.lastDetectedAt })],
  ["required_inputs", (item) => ({ id: item.id, plot_id: item.plotId, attention_item_id: item.attentionItemId, input_key: item.key, status: item.status, updated_at: item.answeredAt ?? item.dismissedAt ?? item.createdAt })],
  ["notifications", (item) => ({ id: item.id, plot_id: item.plotId, dedupe_key: item.dedupeKey, status: item.status, next_attempt_at: item.nextAttemptAt })],
  ["conversations", (item) => ({ id: item.id, entity_type: item.primaryEntityType, entity_id: item.primaryEntityId, status: item.status, updated_at: item.updatedAt })],
  ["conversation_messages", (item) => ({ id: item.id, conversation_id: item.conversationId, created_at: item.createdAt })],
  ["conversation_contexts", (item) => ({ id: item.id, conversation_id: item.conversationId, entity_type: item.entityType, entity_id: item.entityId, relation: item.relation, created_at: item.createdAt })],
  ["conversation_operations", (item) => ({ id: item.id, conversation_id: item.conversationId, status: item.status, created_at: item.createdAt })]
];
const prepared = definitions.map(([table, project]) => ({
  table,
  rows: payloads(table).map((payload) => ({ workspace_id: membership.workspace_id, ...project(payload), payload }))
}));
database.close();

console.log(`Target Workspace: ${membership.workspace_id}`);
console.log(`Source database: ${databasePath}`);
for (const item of prepared) console.log(`${item.table}: ${item.rows.length}`);
if (!confirmed) {
  console.log("Dry run only. Re-run with --confirm-import to write these records.");
  process.exit(0);
}

for (const { table, rows } of prepared) {
  for (let index = 0; index < rows.length; index += 250) {
    const { error } = await client.from(table).upsert(rows.slice(index, index + 250), {
      onConflict: "workspace_id,id",
      ignoreDuplicates: false
    });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

for (const { table, rows } of prepared) {
  const { count, error } = await client.from(table)
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", membership.workspace_id);
  if (error) throw new Error(`${table} verification: ${error.message}`);
  if (count !== rows.length) throw new Error(`${table} verification: expected ${rows.length}, found ${count ?? 0}`);
}
console.log("Import completed and all Workspace row counts match. Local data was preserved.");
