-- Friends: you send a request, they accept. Either of you can remove it later.
create table public.friendships (
  requester uuid not null references auth.users on delete cascade,
  addressee uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- Only one friendship per pair, whoever asked first.
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;
create policy "see your friendships" on public.friendships for select
  using (auth.uid() in (requester, addressee));
create policy "send a request" on public.friendships for insert
  with check (requester = auth.uid() and status = 'pending');
create policy "accept a request sent to you" on public.friendships for update
  using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
create policy "remove a friendship" on public.friendships for delete
  using (auth.uid() in (requester, addressee));

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted'
    and ((requester = a and addressee = b) or (requester = b and addressee = a)));
$$;

-- "Friends" profiles are now visible to friends.
drop policy "see public profiles and your own" on public.profiles;
create policy "see public, friends' and your own profiles" on public.profiles for select
  using (visibility = 'public' or id = auth.uid() or (visibility = 'friends' and public.are_friends(id, auth.uid())));

-- Find someone by exact username to add them, even if their profile is private.
-- Only shows the name and picture.
create or replace function public.find_user(name text)
returns table (id uuid, username text, display_name text, avatar_url text, avatar_color text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_color
  from profiles p where p.username = lower(trim(leading '@' from name)) and auth.uid() is not null;
$$;

-- Your friends and requests, with their names and pictures.
create or replace function public.my_friends()
returns table (id uuid, username text, display_name text, avatar_url text, avatar_color text,
               status text, incoming boolean, since timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_color,
         f.status, f.addressee = auth.uid(), coalesce(f.accepted_at, f.created_at)
  from friendships f
  join profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee);
$$;
