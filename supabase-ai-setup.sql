-- The Orchard: AI tutor setup. Run once in Supabase (SQL Editor -> New query -> paste -> Run),
-- after supabase-setup.sql. It keeps a per-person daily count of AI messages so
-- nobody can run up a big bill. Only the ai-chat function (service role) can use it.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
-- Browsers can't change it; people can only read their own count.
drop policy if exists "Read own usage" on public.ai_usage;
create policy "Read own usage" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.ai_usage from anon;
grant select on public.ai_usage to authenticated;

-- Takes one message from today's allowance. Returns how many are left,
-- or -1 if the limit is already used up.
create or replace function public.ai_take_quota(uid uuid, day_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare used integer;
begin
  insert into public.ai_usage (user_id, day, count)
  values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set count = public.ai_usage.count + 1
    where public.ai_usage.count < day_limit
  returning count into used;
  if used is null then return -1; end if;
  return day_limit - used;
end;
$$;

-- Gives a message back when the reply failed.
create or replace function public.ai_refund_quota(uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage set count = greatest(count - 1, 0)
  where user_id = uid and day = (now() at time zone 'utc')::date;
$$;

revoke execute on function public.ai_take_quota(uuid, integer) from public, anon, authenticated;
revoke execute on function public.ai_refund_quota(uuid) from public, anon, authenticated;
grant execute on function public.ai_take_quota(uuid, integer) to service_role;
grant execute on function public.ai_refund_quota(uuid) to service_role;
