-- Safe to run again if an earlier try stopped halfway.
-- Wishlist gifts: friends see your wishlist and wantlist and can secretly mark
-- "I'm getting this", so nobody buys the same present twice. You never see
-- who claimed what on your own list.

-- Needs 03-friends.sql. On unless you switch it off (Books → Wishlist).
alter table public.profiles add column if not exists wishlist_open boolean not null default true;

create table if not exists public.gift_claims (
  owner uuid not null references auth.users on delete cascade,   -- whose wishlist
  item_id text not null,                                         -- the item's id in their library
  claimer uuid not null references auth.users on delete cascade, -- the friend getting it
  item jsonb not null,                                           -- {title, by, cover, kind}
  note text not null default '' check (char_length(note) <= 200), -- e.g. "for her birthday"
  created_at timestamptz not null default now(),
  primary key (owner, item_id),
  check (owner <> claimer)
);
create index if not exists gift_claims_claimer on public.gift_claims (claimer);

alter table public.gift_claims enable row level security;
-- Only the friend who claimed it reads the row. The owner never can, so the
-- surprise holds; other friends only learn "Sam is getting this" through
-- friend_wishlist() below.
drop policy if exists "claimer sees own claims" on public.gift_claims;
create policy "claimer sees own claims" on public.gift_claims for select
  using (claimer = auth.uid());
drop policy if exists "claim from a friend's open wishlist" on public.gift_claims;
create policy "claim from a friend's open wishlist" on public.gift_claims for insert with check (
  claimer = auth.uid() and public.are_friends(owner, auth.uid())
  and exists (select 1 from public.profiles p where p.id = owner and p.wishlist_open)
);
drop policy if exists "claimer changes the note" on public.gift_claims;
create policy "claimer changes the note" on public.gift_claims for update
  using (claimer = auth.uid()) with check (claimer = auth.uid());
drop policy if exists "claimer takes it back" on public.gift_claims;
create policy "claimer takes it back" on public.gift_claims for delete
  using (claimer = auth.uid());

-- On someone's wishlist: a book or record they don't own, marked Wishlist or
-- "Want to read" (the same rule as the Wishlist page in the app).
create or replace function public.on_wishlist(uid uuid, item_id text, data jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(data->>'owned', 'true') = 'false'
     and (data->>'wishlist' = 'true'
          or exists (select 1 from items r where r.user_id = uid and r.store = 'readings' and not r.deleted
                       and r.data->>'bookId' = item_id and r.data->>'status' = 'want'));
$$;
-- Only used inside the functions below, never called from the app.
revoke execute on function public.on_wishlist(uuid, text, jsonb) from public, anon, authenticated;

-- A friend's wishlist and wantlist: only what they marked as wanted, nothing
-- private. "claimed_by" is the friend who's getting it (null if nobody is).
drop function if exists public.friend_wishlist(uuid);
create or replace function public.friend_wishlist(friend uuid)
returns table (id text, kind text, title text, author text, cover text, year text, isbn text,
               claimed_by_me boolean, claimed_by text, note text)
language sql stable security definer set search_path = public as $$
  select i.id, coalesce(i.data->>'kind', 'book'), i.data->>'title', i.data->'authors'->>0,
         case when i.data->>'coverUrl' like 'https://%' then i.data->>'coverUrl' end,
         left(i.data->>'publishedDate', 4), i.data->>'isbn13',
         coalesce(c.claimer = auth.uid(), false),
         case when c.claimer is null then null
              else coalesce(nullif(p.display_name, ''), '@' || p.username) end,
         case when c.claimer = auth.uid() then c.note end
  from items i
  left join gift_claims c on c.owner = friend and c.item_id = i.id
  left join profiles p on p.id = c.claimer
  where friend <> auth.uid()
    and i.user_id = friend and i.store = 'books' and not i.deleted and i.data is not null
    and public.on_wishlist(friend, i.id, i.data)
    and public.are_friends(friend, auth.uid())
    and coalesce((select wishlist_open from profiles where profiles.id = friend), false)
  order by lower(i.data->>'title');
$$;

-- Presents you're getting, with who for and whether they still want it
-- (they may have bought it themselves since).
drop function if exists public.my_gift_claims();
create or replace function public.my_gift_claims()
returns table (owner uuid, item_id text, item jsonb, note text, created_at timestamptz, still_wanted boolean, friend jsonb)
language sql stable security definer set search_path = public as $$
  select c.owner, c.item_id, c.item, c.note, c.created_at,
         exists (select 1 from items i where i.user_id = c.owner and i.store = 'books' and i.id = c.item_id
                   and not i.deleted and public.on_wishlist(c.owner, i.id, i.data)),
         jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                            'avatar_url', p.avatar_url, 'avatar_color', p.avatar_color)
  from gift_claims c join profiles p on p.id = c.owner
  where c.claimer = auth.uid()
  order by c.created_at desc;
$$;
