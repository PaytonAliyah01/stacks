-- Lending: friends browse your shelves and ask to borrow; you say yes with a
-- due date, and both of you see who has what until it comes back.

-- Off until you switch it on (Friends → Lending).
alter table public.profiles add column if not exists lend_open boolean not null default false;

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  borrower uuid not null references auth.users on delete cascade,
  item_id text not null,             -- the book's id in the owner's library
  item jsonb not null,               -- {title, by, cover, kind}
  status text not null default 'requested'
    check (status in ('requested', 'lent', 'returned', 'declined', 'cancelled')),
  note text not null default '' check (char_length(note) <= 300),   -- from the borrower
  reply text not null default '' check (char_length(reply) <= 300), -- from the owner
  due_on date,
  created_at timestamptz not null default now(),
  lent_at timestamptz,
  returned_at timestamptz,
  updated_at timestamptz not null default now(),
  check (owner <> borrower)
);
create index loans_owner on public.loans (owner, status);
create index loans_borrower on public.loans (borrower, status);
-- A copy can only be out with one person, and you can only ask once at a time.
create unique index loans_one_out on public.loans (owner, item_id) where status = 'lent';
create unique index loans_one_ask on public.loans (borrower, owner, item_id) where status = 'requested';
create trigger loans_touch before update on public.loans
for each row execute function public.touch_updated_at();

alter table public.loans enable row level security;
create policy "owner and borrower see the loan" on public.loans for select
  using (auth.uid() in (owner, borrower));
create policy "ask a friend who lends" on public.loans for insert with check (
  borrower = auth.uid() and status = 'requested' and public.are_friends(owner, auth.uid())
  and exists (select 1 from public.profiles p where p.id = owner and p.lend_open)
);
create policy "lend to a friend" on public.loans for insert with check (
  owner = auth.uid() and status = 'lent' and public.are_friends(borrower, auth.uid())
);
create policy "owner answers and marks returned" on public.loans for update
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy "borrower cancels a request" on public.loans for update
  using (borrower = auth.uid() and status = 'requested')
  with check (borrower = auth.uid() and status = 'cancelled');

-- Is this friend's library open for borrowing?
create or replace function public.lending_open(friend uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select lend_open from profiles where id = friend), false)
     and public.are_friends(friend, auth.uid());
$$;

-- A friend's shelves: only what they own, and nothing private (no prices,
-- notes or where it sits). "out" means it's lent to someone right now.
create or replace function public.friend_shelf(friend uuid)
returns table (id text, kind text, title text, by text, cover text, year text, out boolean)
language sql stable security definer set search_path = public as $$
  select i.id, coalesce(i.data->>'kind', 'book'), i.data->>'title', i.data->'authors'->>0,
         case when i.data->>'coverUrl' like 'https://%' then i.data->>'coverUrl' end,
         left(i.data->>'publishedDate', 4),
         jsonb_typeof(i.data->'loan') = 'object'
           or exists (select 1 from loans l where l.owner = friend and l.item_id = i.id and l.status = 'lent')
  from items i
  where i.user_id = friend and i.store = 'books' and not i.deleted and i.data is not null
    and coalesce(i.data->>'owned', 'true') <> 'false'
    and public.lending_open(friend)
  order by lower(i.data->>'title');
$$;

-- Your loans both ways, with the other person's name and picture.
create or replace function public.my_loans()
returns table (id uuid, owner uuid, borrower uuid, item_id text, item jsonb, status text, note text, reply text,
               due_on date, created_at timestamptz, lent_at timestamptz, returned_at timestamptz, other jsonb)
language sql stable security definer set search_path = public as $$
  select l.id, l.owner, l.borrower, l.item_id, l.item, l.status, l.note, l.reply,
         l.due_on, l.created_at, l.lent_at, l.returned_at,
         jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                            'avatar_url', p.avatar_url, 'avatar_color', p.avatar_color)
  from loans l
  join profiles p on p.id = case when l.owner = auth.uid() then l.borrower else l.owner end
  where auth.uid() in (l.owner, l.borrower)
    and (l.status in ('requested', 'lent') or l.updated_at > now() - interval '60 days')
  order by l.updated_at desc;
$$;
