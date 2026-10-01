create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  context_mode text not null default 'conversational' check (context_mode in ('conversational', 'focused')),
  guided_workflows boolean not null default false,
  entity_memory boolean not null default true,
  global_memory boolean not null default false,
  voice_input boolean not null default true,
  locale text not null default 'pt-BR',
  time_zone text not null default 'America/Sao_Paulo',
  updated_at timestamptz not null default now()
);

-- Ciphertext is produced by the trusted Trama server with TRAMA_CREDENTIAL_SECRET.
-- No browser-facing policy grants direct access to this table.
create table if not exists public.ai_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'ollama' check (provider in ('ollama', 'openai')),
  encrypted_openai_key text,
  openai_model text,
  updated_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(candidate_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = candidate_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_trama_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  created_workspace_id uuid;
  chosen_name text;
begin
  chosen_name := coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Meu Trama');
  insert into public.profiles (user_id, display_name) values (new.id, chosen_name);
  insert into public.workspaces (name) values ('Trama de ' || chosen_name) returning id into created_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (created_workspace_id, new.id, 'owner');
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_trama on auth.users;
create trigger on_auth_user_created_trama after insert on auth.users
for each row execute procedure public.handle_new_trama_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.user_preferences enable row level security;
alter table public.ai_credentials enable row level security;

create policy "profiles_select_self" on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "profiles_update_self" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workspaces_select_member" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "members_select_same_workspace" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "preferences_select_self" on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy "preferences_update_self" on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.ai_credentials from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;
grant select, update on public.user_preferences to authenticated;

