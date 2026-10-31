-- Book clubs: a group of friends that reads one book at a time. Each club
-- book is a buddy read (progress, spoiler-free chat) with a meeting date and
-- place, and members suggest and vote on what to read next.
-- Needs 05-buddy-reads.sql. Safe to run more than once.

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  about text not null default '' check (char_length(about) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  invited_by uuid references auth.users on delete set null,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table if not exists public.club_suggestions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book jsonb not null,               -- {title, by, cover, isbn13, pages}
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists club_suggestions_club on public.club_suggestions (club_id);

create table if not exists public.club_votes (
  suggestion_id uuid not null references public.club_suggestions on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  primary key (suggestion_id, user_id)
);

-- Each club book is a buddy read that belongs to the club.
alter table public.buddy_reads add column if not exists club_id uuid references public.clubs on delete set null;
alter table public.buddy_reads add column if not exists meet_at timestamptz;
alter table public.buddy_reads add column if not exists meet_where text check (char_length(meet_where) <= 200);
create index if not exists buddy_reads_club on public.buddy_reads (club_id, created_at);

-- In the club: joined, or invited if "invited_ok".
create or replace function public.in_club(cid uuid, uid uuid, invited_ok boolean default true) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = cid and user_id = uid and (invited_ok or status = 'joined'))
      or exists (select 1 from clubs where id = cid and owner = uid);
$$;

alter table public.clubs enable row level security;
drop policy if exists "members see the club" on public.clubs;
create policy "members see the club" on public.clubs for select using (public.in_club(id, auth.uid()));
drop policy if exists "start a club" on public.clubs;
create policy "start a club" on public.clubs for insert with check (owner = auth.uid());
drop policy if exists "host changes the club" on public.clubs;
create policy "host changes the club" on public.clubs for update using (owner = auth.uid());
drop policy if exists "host deletes the club" on public.clubs;
create policy "host deletes the club" on public.clubs for delete using (owner = auth.uid());

alter table public.club_members enable row level security;
drop policy if exists "members see each other" on public.club_members;
create policy "members see each other" on public.club_members for select using (public.in_club(club_id, auth.uid()));
-- The host adds themself; any member who joined can invite their own friends.
drop policy if exists "invite friends to the club" on public.club_members;
create policy "invite friends to the club" on public.club_members for insert with check (
  (user_id = auth.uid() and exists (select 1 from public.clubs c where c.id = club_id and c.owner = auth.uid()))
  or (public.in_club(club_id, auth.uid(), false) and public.are_friends(user_id, auth.uid()) and status = 'invited')
);
drop policy if exists "join when invited" on public.club_members;
create policy "join when invited" on public.club_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "leave, or host removes" on public.club_members;
create policy "leave, or host removes" on public.club_members for delete using (
  user_id = auth.uid() or exists (select 1 from public.clubs c where c.id = club_id and c.owner = auth.uid())
);

alter table public.club_suggestions enable row level security;
drop policy if exists "members see suggestions" on public.club_suggestions;
create policy "members see suggestions" on public.club_suggestions for select using (public.in_club(club_id, auth.uid()));
drop policy if exists "members suggest" on public.club_suggestions;
create policy "members suggest" on public.club_suggestions for insert
  with check (user_id = auth.uid() and public.in_club(club_id, auth.uid(), false));
drop policy if exists "take back a suggestion, or host removes" on public.club_suggestions;
create policy "take back a suggestion, or host removes" on public.club_suggestions for delete using (
  user_id = auth.uid() or exists (select 1 from public.clubs c where c.id = club_id and c.owner = auth.uid())
);

alter table public.club_votes enable row level security;
drop policy if exists "members see votes" on public.club_votes;
create policy "members see votes" on public.club_votes for select using (
  exists (select 1 from public.club_suggestions s where s.id = suggestion_id and public.in_club(s.club_id, auth.uid()))
);
drop policy if exists "members vote" on public.club_votes;
create policy "members vote" on public.club_votes for insert with check (
  user_id = auth.uid() and exists (select 1 from public.club_suggestions s where s.id = suggestion_id and public.in_club(s.club_id, auth.uid(), false))
);
drop policy if exists "take back your vote" on public.club_votes;
create policy "take back your vote" on public.club_votes for delete using (user_id = auth.uid());

-- Club books: the host invites every club member (friends of theirs or not),
-- and members who join the club later can add themselves to the current book.
drop policy if exists "club host invites the club" on public.buddy_members;
create policy "club host invites the club" on public.buddy_members for insert with check (
  exists (select 1 from public.buddy_reads r where r.id = read_id and r.owner = auth.uid() and r.club_id is not null
            and public.in_club(r.club_id, user_id))
);
drop policy if exists "club members add themselves" on public.buddy_members;
create policy "club members add themselves" on public.buddy_members for insert with check (
  user_id = auth.uid() and exists (select 1 from public.buddy_reads r where r.id = read_id and r.club_id is not null
            and public.in_club(r.club_id, auth.uid(), false))
);
-- Only the host starts a club book.
drop policy if exists "start a read" on public.buddy_reads;
create policy "start a read" on public.buddy_reads for insert with check (
  owner = auth.uid() and (club_id is null or exists (select 1 from public.clubs c where c.id = club_id and c.owner = auth.uid()))
);

-- Buddy reads now also say which club they belong to and when it meets.
drop function if exists public.my_buddy_reads();
create or replace function public.my_buddy_reads()
returns table (id uuid, owner uuid, book jsonb, note text, finish_by date, created_at timestamptz, members jsonb,
               club_id uuid, meet_at timestamptz, meet_where text)
language sql stable security definer set search_path = public as $$
  select r.id, r.owner, r.book, r.note, r.finish_by, r.created_at,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', p.username, 'display_name', p.display_name,
        'avatar_url', p.avatar_url, 'avatar_color', p.avatar_color, 'status', m.status,
        'book_id', case when m.user_id = auth.uid() then m.book_id end,
        'page', m.page, 'pct', m.pct, 'finished_at', m.finished_at, 'rating', m.rating, 'updated_at', m.updated_at)
      order by m.user_id = r.owner desc, p.username), '[]'::jsonb)
     from buddy_members m join profiles p on p.id = m.user_id
     where m.read_id = r.id and m.status <> 'left'),
    r.club_id, r.meet_at, r.meet_where
  from buddy_reads r
  where auth.uid() is not null and public.in_buddy_read(r.id, auth.uid())
  order by r.created_at desc;
$$;

-- Your clubs: members, every book so far (newest first) and the suggestions
-- with their votes.
drop function if exists public.my_clubs();
create or replace function public.my_clubs()
returns table (id uuid, owner uuid, name text, about text, created_at timestamptz, members jsonb, books jsonb, suggestions jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, c.owner, c.name, c.about, c.created_at,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', p.username, 'display_name', p.display_name,
        'avatar_url', p.avatar_url, 'avatar_color', p.avatar_color, 'status', m.status, 'joined_at', m.joined_at)
      order by m.user_id = c.owner desc, m.status, p.username), '[]'::jsonb)
     from club_members m join profiles p on p.id = m.user_id where m.club_id = c.id),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'read_id', r.id, 'book', r.book, 'created_at', r.created_at, 'meet_at', r.meet_at, 'meet_where', r.meet_where,
        'finished', (select count(*) from buddy_members bm where bm.read_id = r.id and bm.finished_at is not null),
        'rating', (select round(avg(bm.rating), 1) from buddy_members bm where bm.read_id = r.id and bm.rating is not null))
      order by r.created_at desc), '[]'::jsonb)
     from buddy_reads r where r.club_id = c.id),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'book', s.book, 'note', s.note, 'user_id', s.user_id, 'created_at', s.created_at,
        'by', coalesce(nullif(p.display_name, ''), '@' || p.username),
        'votes', (select count(*) from club_votes v where v.suggestion_id = s.id),
        'voted', exists (select 1 from club_votes v where v.suggestion_id = s.id and v.user_id = auth.uid()))
      order by s.created_at), '[]'::jsonb)
     from club_suggestions s join profiles p on p.id = s.user_id where s.club_id = c.id)
  from clubs c
  where auth.uid() is not null and public.in_club(c.id, auth.uid())
  order by c.created_at desc;
$$;
