-- Safe to run again if an earlier try stopped halfway.
-- Shareable shelf link: a secret link anyone can open, no account needed,
-- showing only what you choose (books, records, wishlist, bookcases, ratings).
-- Needs 01 (items) and 02 (profiles). Turning the link off or making a new
-- one stops the old link working straight away.

create table if not exists public.shelf_links (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  title text not null default '' check (char_length(title) <= 80),
  show_books boolean not null default true,
  show_music boolean not null default true,
  show_wishlist boolean not null default false,
  show_shelves boolean not null default true,
  show_ratings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shelf_links enable row level security;
drop policy if exists "own share link" on public.shelf_links;
create policy "own share link" on public.shelf_links for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- What someone with the link sees. Only safe fields leave the database:
-- never prices, notes, loans, locations, tags or reviews.
drop function if exists public.shared_shelf(text);
create or replace function public.shared_shelf(t text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', s.title,
    'name', coalesce(nullif(p.display_name, ''), p.username),
    'avatar_url', p.avatar_url,
    'avatar_color', p.avatar_color,
    'show', jsonb_build_object('books', s.show_books, 'music', s.show_music, 'wishlist', s.show_wishlist,
                               'shelves', s.show_shelves, 'ratings', s.show_ratings),
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', i.id,
        'kind', coalesce(i.data->>'kind', 'book'),
        'title', i.data->>'title',
        'authors', i.data->'authors',
        'cover', case when i.data->>'coverUrl' like 'https://%' then i.data->>'coverUrl' end,
        'year', left(i.data->>'publishedDate', 4),
        'pages', i.data->'pageCount',
        'format', i.data->>'format',
        'copies', i.data->'copies',
        'isbn13', i.data->>'isbn13',
        'discCount', i.data->'discCount',
        'vinylSize', i.data->'vinylSize',
        'series', i.data->'series',
        'wanted', coalesce(i.data->>'owned', 'true') = 'false',
        'placement', case when s.show_shelves then i.data->'placement' end,
        'rating', case when s.show_ratings then (
            select max((r.data->>'rating')::numeric) from items r
            where r.user_id = s.user_id and r.store = 'readings' and not r.deleted
              and r.data->>'bookId' = i.id and r.data ? 'rating') end
      )) order by lower(i.data->>'title'))
      from items i
      where i.user_id = s.user_id and i.store = 'books' and not i.deleted and i.data is not null
        and (
          (coalesce(i.data->>'owned', 'true') <> 'false'
            and ((coalesce(i.data->>'kind', 'book') = 'book' and s.show_books)
              or (coalesce(i.data->>'kind', 'book') <> 'book' and s.show_music)))
          or (s.show_wishlist and coalesce(i.data->>'owned', 'true') = 'false'
            and (i.data->>'wishlist' = 'true'
                 or exists (select 1 from items r where r.user_id = s.user_id and r.store = 'readings' and not r.deleted
                              and r.data->>'bookId' = i.id and r.data->>'status' = 'want')))
        )
    ), '[]'::jsonb),
    'bookcases', case when s.show_shelves then coalesce((
      select jsonb_agg(b.data order by (b.data->>'order')::numeric nulls last)
      from items b where b.user_id = s.user_id and b.store = 'bookcases' and not b.deleted and b.data is not null
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from shelf_links s join profiles p on p.id = s.user_id
  where s.token = t and s.enabled and length(t) >= 24;
$$;
grant execute on function public.shared_shelf(text) to anon, authenticated;
