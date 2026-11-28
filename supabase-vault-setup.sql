-- The Orchard: The Vault's AI marking. Run this once in Supabase
-- (SQL Editor -> New query -> paste -> Run). Safe to run again.

-- 1. A daily allowance of AI markings per student, so costs stay predictable.
create table if not exists public.vault_ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  used    integer not null default 0,
  primary key (user_id, day)
);
alter table public.vault_ai_usage enable row level security;
drop policy if exists "Read own usage" on public.vault_ai_usage;
create policy "Read own usage" on public.vault_ai_usage for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.vault_ai_usage from anon;
grant select on public.vault_ai_usage to authenticated;

-- Takes one marking from today's allowance (UK days). Returns how many have been
-- used today, or -1 if the allowance is already used up. Only the marking
-- function calls this, with the student's own sign-in.
create or replace function public.vault_take_mark(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Europe/London')::date;
  n integer;
begin
  if me is null then raise exception 'Not signed in'; end if;
  insert into public.vault_ai_usage (user_id, day, used) values (me, today, 1)
  on conflict (user_id, day) do update set used = public.vault_ai_usage.used + 1
    where public.vault_ai_usage.used < greatest(p_limit, 1)
  returning used into n;
  return coalesce(n, -1);
end;
$$;
revoke all on function public.vault_take_mark(integer) from public, anon;
grant execute on function public.vault_take_mark(integer) to authenticated;

-- 2. Marks a student thinks are wrong. Students add and see their own; you can
--    read them all in Table Editor -> vault_flags.
create table if not exists public.vault_flags (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  paper_id   text not null check (char_length(paper_id) <= 80),
  part_id    text not null check (char_length(part_id) <= 80),
  awarded    integer,
  max_marks  integer,
  reason     text not null check (char_length(reason) between 1 and 1000),
  answer     jsonb,
  created_at timestamptz not null default now()
);
alter table public.vault_flags enable row level security;
drop policy if exists "Add own flags" on public.vault_flags;
drop policy if exists "Read own flags" on public.vault_flags;
create policy "Add own flags"  on public.vault_flags for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Read own flags" on public.vault_flags for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.vault_flags from anon;
grant select, insert on public.vault_flags to authenticated;
