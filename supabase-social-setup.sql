-- The Orchard: Social (The Neighbourhood). Run once in Supabase
-- (SQL Editor -> New query -> paste -> Run), after supabase-setup.sql.
--
-- Privacy model: nothing is public. People can only find each other by
-- typing an exact @handle, and only friends can see each other's notes,
-- study stats and online status.

-- ---------- Tables ----------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  handle       text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar       jsonb not null default '{}'::jsonb check (pg_column_size(avatar) < 1500),
  status       text check (char_length(status) <= 80),
  share_stats  boolean not null default true,
  stats        jsonb check (stats is null or pg_column_size(stats) < 1500),
  last_seen    timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
-- One link per pair, whichever direction it was sent in
create unique index if not exists friend_requests_pair on public.friend_requests (least(from_id, to_id), greatest(from_id, to_id));

create table if not exists public.notes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 140),
  created_at timestamptz not null default now()
);
create index if not exists notes_user_time on public.notes (user_id, created_at desc);

create table if not exists public.cheers (
  note_id    bigint not null references public.notes (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

-- ---------- Helpers ----------------------------------------------------------
create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friend_requests r
    where r.status = 'accepted'
      and ((r.from_id = a and r.to_id = b) or (r.from_id = b and r.to_id = a))
  );
$$;

-- Exact handle lookup only, so nobody can browse the list of users.
create or replace function public.find_profile(h text)
returns table (id uuid, handle text, display_name text, avatar jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, p.handle, p.display_name, p.avatar
  from public.profiles p
  where auth.uid() is not null and p.handle = lower(btrim(h, ' @'))
  limit 1;
$$;

-- Name and avatar for people you've sent a request to (no stats, no status).
create or replace function public.my_outgoing()
returns table (request_id bigint, id uuid, handle text, display_name text, avatar jsonb, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, p.id, p.handle, p.display_name, p.avatar, r.created_at
  from public.friend_requests r join public.profiles p on p.id = r.to_id
  where r.from_id = auth.uid() and r.status = 'pending'
  order by r.created_at desc;
$$;

-- Accept a request sent to you. Only the person it was sent to can do this.
create or replace function public.accept_request(req bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.friend_requests set status = 'accepted'
  where id = req and to_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Request not found'; end if;
end;
$$;

-- Send a request. If they already asked you, this accepts theirs instead.
create or replace function public.send_request(target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); existing public.friend_requests%rowtype;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if target = me then raise exception 'That''s you'; end if;
  if not exists (select 1 from public.profiles where id = me) then raise exception 'Set up your profile first'; end if;
  select * into existing from public.friend_requests
   where least(from_id, to_id) = least(me, target) and greatest(from_id, to_id) = greatest(me, target);
  if found then
    if existing.status = 'accepted' then return 'already_friends'; end if;
    if existing.to_id = me then
      update public.friend_requests set status = 'accepted' where id = existing.id;
      return 'accepted';
    end if;
    return 'already_sent';
  end if;
  if (select count(*) from public.friend_requests where from_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many requests today. Try again tomorrow.';
  end if;
  insert into public.friend_requests (from_id, to_id) values (me, target);
  return 'sent';
end;
$$;

-- How many notes you've posted in the last day (used for a daily limit).
create or replace function public.my_notes_today()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notes where user_id = auth.uid() and created_at > now() - interval '1 day';
$$;

revoke execute on function public.is_friend(uuid, uuid), public.find_profile(text), public.my_outgoing(),
  public.accept_request(bigint), public.send_request(uuid), public.my_notes_today() from public, anon;
grant execute on function public.is_friend(uuid, uuid), public.find_profile(text), public.my_outgoing(),
  public.accept_request(bigint), public.send_request(uuid), public.my_notes_today() to authenticated;

-- ---------- Row-level security ----------------------------------------------
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.notes enable row level security;
alter table public.cheers enable row level security;

drop policy if exists "See self, friends and people who asked you" on public.profiles;
drop policy if exists "Create own profile" on public.profiles;
drop policy if exists "Edit own profile" on public.profiles;
create policy "See self, friends and people who asked you" on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or public.is_friend((select auth.uid()), id)
  or exists (select 1 from public.friend_requests r where r.from_id = profiles.id and r.to_id = (select auth.uid()) and r.status = 'pending')
);
create policy "Create own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "Edit own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "See your own requests" on public.friend_requests;
drop policy if exists "Remove your own requests or friendships" on public.friend_requests;
create policy "See your own requests" on public.friend_requests for select to authenticated using ((select auth.uid()) in (from_id, to_id));
create policy "Remove your own requests or friendships" on public.friend_requests for delete to authenticated using ((select auth.uid()) in (from_id, to_id));
-- (Sending and accepting go through send_request / accept_request.)

drop policy if exists "Read your and your friends' notes" on public.notes;
drop policy if exists "Post your own notes" on public.notes;
drop policy if exists "Delete your own notes" on public.notes;
create policy "Read your and your friends' notes" on public.notes for select to authenticated using (
  user_id = (select auth.uid()) or public.is_friend((select auth.uid()), user_id)
);
create policy "Post your own notes" on public.notes for insert to authenticated with check (
  user_id = (select auth.uid())
  and public.my_notes_today() < 30
);
create policy "Delete your own notes" on public.notes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "See cheers on notes you can see" on public.cheers;
drop policy if exists "Cheer notes you can see" on public.cheers;
drop policy if exists "Remove your own cheers" on public.cheers;
create policy "See cheers on notes you can see" on public.cheers for select to authenticated using (
  exists (select 1 from public.notes n where n.id = cheers.note_id)
);
create policy "Cheer notes you can see" on public.cheers for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.notes n where n.id = cheers.note_id)
);
create policy "Remove your own cheers" on public.cheers for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.profiles, public.friend_requests, public.notes, public.cheers from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, delete on public.friend_requests to authenticated;
grant select, insert, delete on public.notes to authenticated;
grant select, insert, delete on public.cheers to authenticated;
