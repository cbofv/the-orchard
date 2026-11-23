-- The Orchard: Social, part 4 — study rooms, announcements and admin stats.
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run),
-- after supabase-social-3.sql. Safe to run again.

-- ---------- Study rooms ------------------------------------------------------
-- A room is opened by one person. Their friends can see it and join.
-- When the owner starts it, everyone sees the same countdown.
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  minutes    integer not null default 25 check (minutes between 5 and 180),
  started_at timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rooms_owner on public.rooms (owner_id, created_at desc);

create table if not exists public.room_members (
  room_id   uuid not null references public.rooms (id) on delete cascade,
  user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject   text check (char_length(subject) <= 60),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Can the signed-in person see this room? (Owner, or a friend of the owner.)
create or replace function public.can_see_room(r uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms x
    where x.id = r and (x.owner_id = auth.uid() or public.is_friend(auth.uid(), x.owner_id))
  );
$$;

-- The owner starts (or restarts) the shared countdown.
create or replace function public.start_room(r uuid, mins integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare t timestamptz := now();
begin
  if mins < 5 or mins > 180 then raise exception 'Choose between 5 and 180 minutes'; end if;
  update public.rooms set minutes = mins, started_at = t, ends_at = t + make_interval(mins => mins)
  where id = r and owner_id = auth.uid();
  if not found then raise exception 'Only the person who opened the room can start it'; end if;
  return t;
end;
$$;

-- The server's clock, so everyone's countdown agrees.
create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now(); $$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
drop policy if exists "See your and your friends' rooms" on public.rooms;
drop policy if exists "Open a room" on public.rooms;
drop policy if exists "Rename your room" on public.rooms;
drop policy if exists "Close your room" on public.rooms;
create policy "See your and your friends' rooms" on public.rooms for select to authenticated using (
  owner_id = (select auth.uid()) or public.is_friend((select auth.uid()), owner_id)
);
create policy "Open a room" on public.rooms for insert to authenticated with check (
  owner_id = (select auth.uid()) and started_at is null and ends_at is null
);
create policy "Rename your room" on public.rooms for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Close your room" on public.rooms for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "See who is in rooms you can see" on public.room_members;
drop policy if exists "Join rooms you can see" on public.room_members;
drop policy if exists "Update your own membership" on public.room_members;
drop policy if exists "Leave a room" on public.room_members;
create policy "See who is in rooms you can see" on public.room_members for select to authenticated using (public.can_see_room(room_id));
create policy "Join rooms you can see" on public.room_members for insert to authenticated with check (user_id = (select auth.uid()) and public.can_see_room(room_id));
create policy "Update your own membership" on public.room_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Leave a room" on public.room_members for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- Announcements (admins post, everyone reads) ---------------------
create table if not exists public.announcements (
  id         bigint generated always as identity primary key,
  body       text not null check (char_length(btrim(body)) between 1 and 240),
  tone       text not null default 'info' check (tone in ('info', 'good', 'warn')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.announcements enable row level security;
drop policy if exists "Everyone reads announcements" on public.announcements;
drop policy if exists "Admins post announcements" on public.announcements;
drop policy if exists "Admins remove announcements" on public.announcements;
create policy "Everyone reads announcements" on public.announcements for select to authenticated using (true);
create policy "Admins post announcements" on public.announcements for insert to authenticated with check (public.is_admin() and created_by = (select auth.uid()));
create policy "Admins remove announcements" on public.announcements for delete to authenticated using (public.is_admin());

-- ---------- Admin stats (counts only, admins only) ---------------------------
create or replace function public.admin_stats()
returns table (accounts bigint, profiles bigint, active_week bigint, online_now bigint, friendships bigint,
               notes_week bigint, messages_week bigint, rooms_week bigint, badges bigint)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from auth.users),
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    (select count(*) from public.profiles where last_seen > now() - interval '5 minutes'),
    (select count(*) from public.friend_requests where status = 'accepted'),
    (select count(*) from public.notes where created_at > now() - interval '7 days'),
    (select count(*) from public.messages where created_at > now() - interval '7 days'),
    (select count(*) from public.rooms where created_at > now() - interval '7 days'),
    (select count(*) from public.awards)
  where public.is_admin();
$$;

revoke execute on function public.can_see_room(uuid), public.start_room(uuid, integer), public.server_now(), public.admin_stats() from public, anon;
grant execute on function public.can_see_room(uuid), public.start_room(uuid, integer), public.server_now(), public.admin_stats() to authenticated;
revoke all on public.rooms, public.room_members, public.announcements from anon;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.room_members to authenticated;
grant select, insert, delete on public.announcements to authenticated;
