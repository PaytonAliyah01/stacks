-- Last.fm: which Last.fm account you linked. Only the "lastfm" Edge Function
-- reads this table (with the service role), so nobody's session key ever
-- reaches a browser. Safe to run more than once.
create table if not exists public.lastfm_links (
  user_id uuid primary key references auth.users on delete cascade,
  session_key text not null,
  username text not null,
  linked_at timestamptz not null default now()
);
alter table public.lastfm_links enable row level security;
-- No policies on purpose: the browser can't read or write it, only the function.
