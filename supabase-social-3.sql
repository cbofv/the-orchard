-- The Orchard: Social, part 3 — show the Admin badge.
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run),
-- after supabase-social-2.sql. Safe to run again.
--
-- Lets signed-in people see which accounts are admins (just the account
-- ids, nothing else), so the Admin badge can appear next to their name.

create or replace function public.admin_ids()
returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.user_id from public.admins a where auth.uid() is not null;
$$;

revoke execute on function public.admin_ids() from public, anon;
grant execute on function public.admin_ids() to authenticated;
