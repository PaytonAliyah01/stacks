-- Buddy reads: read a book together with friends, see each other's progress, chat without spoilers.
create table public.buddy_reads (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  book jsonb not null,               -- {title, by, cover, isbn13, pages}
  note text not null default '' check (char_length(note) <= 300),
  finish_by date,
  created_at timestamptz not null default now()
);

create table public.buddy_members (
  read_id uuid not null references public.buddy_reads on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'left')),
  book_id text,                      -- the book's id in that person's own library
  page int,
  pct int check (pct between 0 and 100),
  finished_at timestamptz,
  rating numeric(2,1) check (rating between 0.5 and 5),
  updated_at timestamptz not null default now(),
  primary key (read_id, user_id)
);

create table public.buddy_messages (
  id uuid primary key default gen_random_uuid(),
  read_id uuid not null references public.buddy_reads on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  page int,                          -- hidden from people who haven't reached this page yet
  created_at timestamptz not null default now()
);
create index buddy_messages_read on public.buddy_messages (read_id, created_at);

create or replace function public.in_buddy_read(rid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from buddy_members where read_id = rid and user_id = uid and status <> 'left')
      or exists (select 1 from buddy_reads where id = rid and owner = uid);
$$;

alter table public.buddy_reads enable row level security;
create policy "members see the read" on public.buddy_reads for select using (public.in_buddy_read(id, auth.uid()));
create policy "start a read" on public.buddy_reads for insert with check (owner = auth.uid());
create policy "owner changes the read" on public.buddy_reads for update using (owner = auth.uid());
create policy "owner deletes the read" on public.buddy_reads for delete using (owner = auth.uid());

alter table public.buddy_members enable row level security;
create policy "members see each other" on public.buddy_members for select using (public.in_buddy_read(read_id, auth.uid()));
create policy "owner invites friends, or adds themself" on public.buddy_members for insert with check (
  exists (select 1 from public.buddy_reads r where r.id = read_id and r.owner = auth.uid())
  and (user_id = auth.uid() or public.are_friends(user_id, auth.uid()))
);
create policy "update your own progress" on public.buddy_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leave, or owner removes" on public.buddy_members for delete using (
  user_id = auth.uid() or exists (select 1 from public.buddy_reads r where r.id = read_id and r.owner = auth.uid())
);

alter table public.buddy_messages enable row level security;
create policy "members read the chat" on public.buddy_messages for select using (public.in_buddy_read(read_id, auth.uid()));
create policy "members write in the chat" on public.buddy_messages for insert
  with check (user_id = auth.uid() and public.in_buddy_read(read_id, auth.uid()));
create policy "delete your own messages" on public.buddy_messages for delete using (user_id = auth.uid());

-- Your buddy reads, with everyone's names, pictures and progress.
create or replace function public.my_buddy_reads()
returns table (id uuid, owner uuid, book jsonb, note text, finish_by date, created_at timestamptz, members jsonb)
language sql stable security definer set search_path = public as $$
  select r.id, r.owner, r.book, r.note, r.finish_by, r.created_at,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', p.username, 'display_name', p.display_name,
        'avatar_url', p.avatar_url, 'avatar_color', p.avatar_color, 'status', m.status,
        'book_id', case when m.user_id = auth.uid() then m.book_id end,
        'page', m.page, 'pct', m.pct, 'finished_at', m.finished_at, 'rating', m.rating, 'updated_at', m.updated_at)
      order by m.user_id = r.owner desc, p.username), '[]'::jsonb)
     from buddy_members m join profiles p on p.id = m.user_id
     where m.read_id = r.id and m.status <> 'left')
  from buddy_reads r
  where auth.uid() is not null and public.in_buddy_read(r.id, auth.uid())
  order by r.created_at desc;
$$;

-- The chat for one read, with names. Only for members.
create or replace function public.buddy_chat(rid uuid)
returns table (id uuid, user_id uuid, username text, display_name text, avatar_url text, avatar_color text,
               body text, page int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, p.username, p.display_name, p.avatar_url, p.avatar_color, c.body, c.page, c.created_at
  from buddy_messages c join profiles p on p.id = c.user_id
  where c.read_id = rid and public.in_buddy_read(rid, auth.uid())
  order by c.created_at;
$$;
