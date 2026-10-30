-- Already run on 2026-10-30. Kept here for reference.
create table public.items (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  store text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, store, id)
);
create index items_user_updated on public.items (user_id, updated_at);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger items_touch before insert or update on public.items
for each row execute function public.touch_updated_at();

alter table public.items enable row level security;
create policy "own rows" on public.items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
