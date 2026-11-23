-- The Orchard: run this once in Supabase (SQL Editor -> New query -> paste -> Run).
-- It creates the table that holds everyone's data, and rules so each
-- person can only ever see and change their own.

create table if not exists public.docs (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path       text not null check (char_length(path) between 1 and 300),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);

alter table public.docs enable row level security;

drop policy if exists "Read own data"   on public.docs;
drop policy if exists "Add own data"    on public.docs;
drop policy if exists "Change own data" on public.docs;
drop policy if exists "Remove own data" on public.docs;

create policy "Read own data"   on public.docs for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own data"    on public.docs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Change own data" on public.docs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Remove own data" on public.docs for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

-- Lets a signed-in person delete their own account (and, through the
-- cascade above, all of their data). It can't touch anyone else's.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
