-- Profiles: one per account. Your library stays private; this is what you choose to show.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 50),
  bio text not null default '' check (char_length(bio) <= 300),
  avatar_url text,
  avatar_color text not null default '#1f5c45',
  accent text not null default '#1f5c45',
  visibility text not null default 'private' check (visibility in ('public', 'friends', 'private')),
  showcase jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before insert or update on public.profiles
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
create policy "see public profiles and your own" on public.profiles for select
  using (visibility = 'public' or id = auth.uid());
create policy "make your own profile" on public.profiles for insert
  with check (id = auth.uid());
create policy "change your own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Profile pictures: anyone can view them, you can only upload into your own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);
create policy "avatar read own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
