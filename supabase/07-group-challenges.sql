-- Reading challenges with friends: one shared goal (books or pages between two
-- dates), everyone's progress on a leaderboard. Safe to run more than once.

create table if not exists public.group_challenges (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  measure text not null default 'books' check (measure in ('books', 'pages')),
  goal int not null check (goal between 1 and 1000000),
  start_on date not null,
  end_on date not null,
  created_at timestamptz not null default now(),
  check (end_on >= start_on)
);

create table if not exists public.group_challenge_members (
  challenge_id uuid not null references public.group_challenges on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  progress int not null default 0 check (progress >= 0),
  latest text check (char_length(latest) <= 200),   -- the last book they finished for it
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create or replace function public.in_group_challenge(cid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_challenge_members where challenge_id = cid and user_id = uid)
      or exists (select 1 from group_challenges where id = cid and owner = uid);
$$;

alter table public.group_challenges enable row level security;
drop policy if exists "members see the challenge" on public.group_challenges;
create policy "members see the challenge" on public.group_challenges for select using (public.in_group_challenge(id, auth.uid()));
drop policy if exists "start a challenge" on public.group_challenges;
create policy "start a challenge" on public.group_challenges for insert with check (owner = auth.uid());
drop policy if exists "owner changes the challenge" on public.group_challenges;
create policy "owner changes the challenge" on public.group_challenges for update using (owner = auth.uid());
drop policy if exists "owner deletes the challenge" on public.group_challenges;
create policy "owner deletes the challenge" on public.group_challenges for delete using (owner = auth.uid());

alter table public.group_challenge_members enable row level security;
drop policy if exists "members see each other" on public.group_challenge_members;
create policy "members see each other" on public.group_challenge_members for select using (public.in_group_challenge(challenge_id, auth.uid()));
drop policy if exists "owner invites friends, or adds themself" on public.group_challenge_members;
create policy "owner invites friends, or adds themself" on public.group_challenge_members for insert with check (
  exists (select 1 from public.group_challenges c where c.id = challenge_id and c.owner = auth.uid())
  and (user_id = auth.uid() or public.are_friends(user_id, auth.uid()))
);
drop policy if exists "update your own progress" on public.group_challenge_members;
create policy "update your own progress" on public.group_challenge_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "leave, or owner removes" on public.group_challenge_members;
create policy "leave, or owner removes" on public.group_challenge_members for delete using (
  user_id = auth.uid() or exists (select 1 from public.group_challenges c where c.id = challenge_id and c.owner = auth.uid())
);

-- Your challenges, with everyone's name, picture and progress.
create or replace function public.my_group_challenges()
returns table (id uuid, owner uuid, name text, measure text, goal int, start_on date, end_on date,
               created_at timestamptz, members jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, c.owner, c.name, c.measure, c.goal, c.start_on, c.end_on, c.created_at,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', p.username, 'display_name', p.display_name,
        'avatar_url', p.avatar_url, 'avatar_color', p.avatar_color, 'status', m.status,
        'progress', m.progress, 'latest', m.latest, 'updated_at', m.updated_at)
      order by m.progress desc, p.username), '[]'::jsonb)
     from group_challenge_members m join profiles p on p.id = m.user_id
     where m.challenge_id = c.id)
  from group_challenges c
  where auth.uid() is not null and public.in_group_challenge(c.id, auth.uid())
  order by c.end_on < current_date, c.end_on, c.created_at desc;
$$;
