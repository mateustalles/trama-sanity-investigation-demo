-- Incremental administrative demo policy only; preserve usage history and RLS.
create or replace function public.consume_sanity_demo_judge_question(candidate_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare metadata jsonb; expiry timestamptz; accepted uuid;
begin
  select raw_app_meta_data into metadata from auth.users where id = candidate_user_id;
  if metadata->>'trama_access' is distinct from 'sanity_demo_judge' then return 'forbidden'; end if;
  begin expiry := (metadata->>'sanity_demo_expires_at')::timestamptz;
  exception when others then return 'expired'; end;
  if expiry is null or expiry <= now() then return 'expired'; end if;
  insert into public.sanity_demo_judge_usage as usage (user_id,total_requests,window_requests)
  values (candidate_user_id,1,1)
  on conflict (user_id) do update set
    total_requests = usage.total_requests + 1,
    window_requests = case when usage.window_started_at <= now() - interval '1 minute' then 1 else usage.window_requests + 1 end,
    window_started_at = case when usage.window_started_at <= now() - interval '1 minute' then now() else usage.window_started_at end
  where usage.total_requests < 600 and
    (usage.window_started_at <= now() - interval '1 minute' or usage.window_requests < 6)
  returning user_id into accepted;
  return case when accepted is null then 'rate_limited' else 'allowed' end;
end;
$$;
revoke all on function public.consume_sanity_demo_judge_question(uuid) from public, anon, authenticated;
grant execute on function public.consume_sanity_demo_judge_question(uuid) to service_role;
