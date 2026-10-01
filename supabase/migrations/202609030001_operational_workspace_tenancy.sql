-- Hosted operational storage. Every row carries the tenant boundary explicitly,
-- including child records, so RLS never depends on trusting JSON payload fields.

create or replace function public.trama_workspace_access(candidate_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = candidate_workspace_id
      and user_id = auth.uid()
  );
$$;

create table if not exists public.plots (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  parent_plot_id text,
  status text not null,
  visibility text not null,
  updated_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, parent_plot_id)
    references public.plots(workspace_id, id)
);

create table if not exists public.open_loops (
  workspace_id uuid not null,
  id text not null,
  plot_id text not null,
  status text not null,
  updated_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, plot_id)
    references public.plots(workspace_id, id) on delete cascade
);

create table if not exists public.actions (
  workspace_id uuid not null,
  id text not null,
  plot_id text not null,
  open_loop_id text,
  resolution text not null,
  deadline_at timestamptz,
  next_review_at timestamptz not null,
  updated_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, plot_id)
    references public.plots(workspace_id, id) on delete cascade,
  foreign key (workspace_id, open_loop_id)
    references public.open_loops(workspace_id, id)
);

create table if not exists public.action_progress (
  workspace_id uuid not null,
  id text not null,
  plot_id text not null,
  action_id text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, plot_id)
    references public.plots(workspace_id, id) on delete cascade,
  foreign key (workspace_id, action_id)
    references public.actions(workspace_id, id) on delete cascade
);

create table if not exists public.audit_events (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  plot_id text,
  entity_id text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, plot_id)
    references public.plots(workspace_id, id)
);

create table if not exists public.review_runs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  idempotency_key text not null,
  status text not null,
  started_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  unique (workspace_id, idempotency_key)
);

create table if not exists public.attention_items (
  workspace_id uuid not null,
  id text not null,
  plot_id text not null,
  fingerprint text not null,
  status text not null,
  updated_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, plot_id)
    references public.plots(workspace_id, id) on delete cascade
);

create table if not exists public.required_inputs (
  workspace_id uuid not null,
  id text not null,
  plot_id text not null,
  attention_item_id text not null,
  input_key text not null,
  status text not null,
  updated_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, plot_id)
    references public.plots(workspace_id, id) on delete cascade,
  foreign key (workspace_id, attention_item_id)
    references public.attention_items(workspace_id, id) on delete cascade
);

create table if not exists public.notifications (
  workspace_id uuid not null,
  id text not null,
  plot_id text not null,
  dedupe_key text not null,
  status text not null,
  next_attempt_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  unique (workspace_id, dedupe_key),
  foreign key (workspace_id, plot_id)
    references public.plots(workspace_id, id) on delete cascade
);

create table if not exists public.conversations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  entity_type text not null,
  entity_id text not null,
  status text not null,
  updated_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id)
);

create table if not exists public.conversation_messages (
  workspace_id uuid not null,
  id text not null,
  conversation_id text not null,
  created_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, conversation_id)
    references public.conversations(workspace_id, id) on delete cascade
);

create table if not exists public.conversation_contexts (
  workspace_id uuid not null,
  id text not null,
  conversation_id text not null,
  entity_type text not null,
  entity_id text not null,
  relation text not null,
  created_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  unique (workspace_id, conversation_id, entity_type, entity_id, relation),
  foreign key (workspace_id, conversation_id)
    references public.conversations(workspace_id, id) on delete cascade
);

create table if not exists public.conversation_operations (
  workspace_id uuid not null,
  id text not null,
  conversation_id text not null,
  status text not null,
  created_at timestamptz not null,
  payload jsonb not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, conversation_id)
    references public.conversations(workspace_id, id) on delete cascade
);

create index if not exists plots_workspace_updated_idx on public.plots(workspace_id, updated_at desc);
create index if not exists open_loops_plot_idx on public.open_loops(workspace_id, plot_id, updated_at desc);
create index if not exists actions_plot_idx on public.actions(workspace_id, plot_id, updated_at desc);
create index if not exists actions_schedule_idx on public.actions(workspace_id, resolution, deadline_at, next_review_at);
create index if not exists action_progress_action_idx on public.action_progress(workspace_id, action_id, occurred_at);
create index if not exists action_progress_plot_idx on public.action_progress(workspace_id, plot_id, occurred_at);
create index if not exists audit_events_plot_idx on public.audit_events(workspace_id, plot_id, occurred_at desc);
create index if not exists attention_items_plot_status_idx on public.attention_items(workspace_id, plot_id, status);
create unique index if not exists attention_items_open_fingerprint_idx
  on public.attention_items(workspace_id, fingerprint)
  where status in ('open', 'acknowledged');
create unique index if not exists required_inputs_open_key_idx
  on public.required_inputs(workspace_id, attention_item_id, input_key)
  where status = 'open';
create index if not exists notifications_delivery_idx on public.notifications(workspace_id, status, next_attempt_at);
create index if not exists conversations_entity_idx on public.conversations(workspace_id, entity_type, entity_id, updated_at desc);
create index if not exists conversation_messages_conversation_idx on public.conversation_messages(workspace_id, conversation_id, created_at);
create index if not exists conversation_contexts_entity_idx on public.conversation_contexts(workspace_id, entity_type, entity_id);
create index if not exists conversation_operations_conversation_idx on public.conversation_operations(workspace_id, conversation_id, created_at);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'plots', 'open_loops', 'actions', 'action_progress', 'audit_events',
    'review_runs', 'attention_items', 'required_inputs', 'notifications',
    'conversations', 'conversation_messages', 'conversation_contexts',
    'conversation_operations'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('drop policy if exists tenant_select on public.%I', table_name);
    execute format('drop policy if exists tenant_insert on public.%I', table_name);
    execute format('drop policy if exists tenant_update on public.%I', table_name);
    execute format('drop policy if exists tenant_delete on public.%I', table_name);
    execute format(
      'create policy tenant_select on public.%I for select to authenticated using (public.trama_workspace_access(workspace_id))',
      table_name
    );
    execute format(
      'create policy tenant_insert on public.%I for insert to authenticated with check (public.trama_workspace_access(workspace_id))',
      table_name
    );
    execute format(
      'create policy tenant_update on public.%I for update to authenticated using (public.trama_workspace_access(workspace_id)) with check (public.trama_workspace_access(workspace_id))',
      table_name
    );
    execute format(
      'create policy tenant_delete on public.%I for delete to authenticated using (public.trama_workspace_access(workspace_id))',
      table_name
    );
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end
$$;

