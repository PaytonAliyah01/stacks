-- Safe to run again.
-- Find people: search by part of a username or name, and "people you may know"
-- (friends of your friends). Needs 03-friends.sql.
-- Only people whose profile is visible to friends or everyone show up here;
-- a private profile is still found by typing its exact username (find_user).

create or replace function public.search_people(q text)
returns table (id uuid, username text, display_name text, avatar_url text, avatar_color text)
language sql stable security definer set search_path = public as $$
  with t as (
    select replace(replace(replace(lower(trim(leading '@' from trim(q))), '\', '\\'), '%', '\%'), '_', '\_') as s
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_color
  from profiles p, t
  where auth.uid() is not null and p.id <> auth.uid() and char_length(t.s) >= 2
    and (p.visibility <> 'private' or p.username = t.s)
    and (p.username like t.s || '%' or lower(p.display_name) like '%' || t.s || '%')
  order by (p.username = t.s) desc, (p.username like t.s || '%') desc, p.username
  limit 20;
$$;
grant execute on function public.search_people(text) to authenticated;

-- Friends of your friends you aren't connected to yet, with how many friends you share.
create or replace function public.people_you_may_know()
returns table (id uuid, username text, display_name text, avatar_url text, avatar_color text, mutual int)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when requester = auth.uid() then addressee else requester end as fid
    from friendships where status = 'accepted' and auth.uid() in (requester, addressee)
  ),
  theirs as (
    select case when f.requester = m.fid then f.addressee else f.requester end as pid
    from friendships f join mine m on m.fid in (f.requester, f.addressee)
    where f.status = 'accepted'
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_color, count(*)::int
  from theirs t join profiles p on p.id = t.pid
  where auth.uid() is not null and t.pid <> auth.uid() and p.visibility <> 'private'
    and not exists (select 1 from friendships x where (x.requester = auth.uid() and x.addressee = t.pid)
                                                 or (x.addressee = auth.uid() and x.requester = t.pid))
  group by p.id, p.username, p.display_name, p.avatar_url, p.avatar_color
  order by count(*) desc, p.username
  limit 12;
$$;
grant execute on function public.people_you_may_know() to authenticated;
