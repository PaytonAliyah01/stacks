-- Feed: what you and your friends are reading, finishing and spinning.
alter table public.profiles add column if not exists share_activity boolean not null default true;

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('started', 'finished', 'dnf', 'rated', 'spin', 'added')),
  items jsonb not null default '[]'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_user_time on public.activity (user_id, created_at desc);

alter table public.activity enable row level security;
create policy "see yours and your friends' activity" on public.activity for select
  using (user_id = auth.uid() or public.are_friends(user_id, auth.uid()));
create policy "post your own activity" on public.activity for insert
  with check (user_id = auth.uid());
create policy "delete your own activity" on public.activity for delete
  using (user_id = auth.uid());

create table public.activity_likes (
  activity_id uuid not null references public.activity on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);
alter table public.activity_likes enable row level security;
create policy "see likes on activity you can see" on public.activity_likes for select
  using (exists (select 1 from public.activity a where a.id = activity_id));
create policy "like activity you can see" on public.activity_likes for insert
  with check (user_id = auth.uid() and exists (select 1 from public.activity a where a.id = activity_id));
create policy "take back your like" on public.activity_likes for delete
  using (user_id = auth.uid());

-- Newest first, with names, pictures and likes. Only yours and your friends'.
create or replace function public.friend_feed(before timestamptz default now(), max_rows int default 40)
returns table (id uuid, user_id uuid, username text, display_name text, avatar_url text, avatar_color text,
               kind text, items jsonb, extra jsonb, created_at timestamptz, likes int, liked boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.user_id, p.username, p.display_name, p.avatar_url, p.avatar_color,
         a.kind, a.items, a.extra, a.created_at,
         (select count(*) from activity_likes l where l.activity_id = a.id)::int,
         exists (select 1 from activity_likes l where l.activity_id = a.id and l.user_id = auth.uid())
  from activity a join profiles p on p.id = a.user_id
  where auth.uid() is not null and a.created_at < before
    and (a.user_id = auth.uid() or are_friends(a.user_id, auth.uid()))
  order by a.created_at desc
  limit least(max_rows, 100);
$$;
