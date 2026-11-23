-- The Orchard: Social, part 2 — direct messages and badges.
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run),
-- AFTER supabase-social-setup.sql. Safe to run again.

-- ---------- Direct messages (friends only) -----------------------------------
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  from_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  check (from_id <> to_id)
);
create index if not exists messages_to_unread on public.messages (to_id, read_at);
create index if not exists messages_pair on public.messages (least(from_id, to_id), greatest(from_id, to_id), created_at desc);

create or replace function public.my_messages_last_hour()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.messages where from_id = auth.uid() and created_at > now() - interval '1 hour';
$$;

-- Mark everything a friend has sent you as read.
create or replace function public.mark_read(friend uuid)
returns void language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
  where to_id = auth.uid() and from_id = friend and read_at is null;
$$;

alter table public.messages enable row level security;
drop policy if exists "Read your own conversations" on public.messages;
drop policy if exists "Message your friends" on public.messages;
drop policy if exists "Unsend your own messages" on public.messages;
create policy "Read your own conversations" on public.messages for select to authenticated using ((select auth.uid()) in (from_id, to_id));
create policy "Message your friends" on public.messages for insert to authenticated with check (
  from_id = (select auth.uid()) and public.is_friend((select auth.uid()), to_id) and public.my_messages_last_hour() < 120
);
create policy "Unsend your own messages" on public.messages for delete to authenticated using (from_id = (select auth.uid()));

-- ---------- Admins and badges ------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "See whether you are an admin" on public.admins;
create policy "See whether you are an admin" on public.admins for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create table if not exists public.awards (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge      text not null check (badge in ('crown', 'diamond', 'laurel', 'flame', 'star', 'heart')),
  note       text check (char_length(note) <= 80),
  awarded_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, badge)
);
alter table public.awards enable row level security;
drop policy if exists "See badges of people you can see" on public.awards;
drop policy if exists "Admins give badges" on public.awards;
drop policy if exists "Admins take badges back" on public.awards;
create policy "See badges of people you can see" on public.awards for select to authenticated using (
  user_id = (select auth.uid()) or public.is_friend((select auth.uid()), user_id) or public.is_admin()
  or exists (select 1 from public.friend_requests r where r.from_id = awards.user_id and r.to_id = (select auth.uid()))
);
create policy "Admins give badges" on public.awards for insert to authenticated with check (public.is_admin() and awarded_by = (select auth.uid()));
create policy "Admins take badges back" on public.awards for delete to authenticated using (public.is_admin());

-- Everything an admin has handed out, with names (admins only).
create or replace function public.admin_awards()
returns table (id bigint, user_id uuid, handle text, display_name text, badge text, note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, p.handle, p.display_name, a.badge, a.note, a.created_at
  from public.awards a join public.profiles p on p.id = a.user_id
  where public.is_admin()
  order by a.created_at desc;
$$;

revoke execute on function public.my_messages_last_hour(), public.mark_read(uuid), public.is_admin(), public.admin_awards() from public, anon;
grant execute on function public.my_messages_last_hour(), public.mark_read(uuid), public.is_admin(), public.admin_awards() to authenticated;

revoke all on public.messages, public.admins, public.awards from anon;
grant select, insert, delete on public.messages to authenticated;
grant select on public.admins to authenticated;
grant select, insert, delete on public.awards to authenticated;

-- ---------- Make yourself an admin -------------------------------------------
-- Replace the email below with the one you sign in with, then run just this line:
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
