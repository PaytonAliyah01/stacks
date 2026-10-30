import type { Book, Reading, Spin } from '../types';
import { isMusic } from '../types';
import { currentReading, progressPct } from './reading';
import { nowSpinning } from './spins';
import { SITE_URL, supabase } from './cloud';

/**
 * Your public face in Stacks. Your library itself stays private; a profile shows
 * a small snapshot of it (the showcase) that you choose to share.
 */
export type Visibility = 'public' | 'friends' | 'private';

export interface ShowcaseItem {
  id: string;
  title: string;
  by?: string;
  cover?: string;
  /** Reading progress 0–100, for currently reading. */
  pct?: number;
}

export interface Showcase {
  topBooks: ShowcaseItem[];
  topRecords: ShowcaseItem[];
  reading: ShowcaseItem[];
  spinning?: ShowcaseItem;
  stats: { books: number; records: number; readThisYear: number; pagesThisYear: number; year: number };
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  avatar_color: string;
  accent: string;
  visibility: Visibility;
  showcase: Partial<Showcase>;
  updated_at?: string;
}

export const AVATAR_COLORS = ['#1f5c45', '#a87a22', '#a3392f', '#3b5ba5', '#7a4a8c', '#2f7d84', '#c2622d', '#4a4f57'];
export const ACCENTS = ['#1f5c45', '#a87a22', '#a3392f', '#3b5ba5', '#7a4a8c', '#2f7d84', '#c2622d', '#d0447a'];

export const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;
export const cleanUsername = (s: string) => s.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');

export const profileLink = (username: string) => `${SITE_URL}#@${username}`;

/** "@name" from the address bar, e.g. stacks/#@elienne. */
export function usernameFromHash(hash = location.hash): string | undefined {
  const m = /^#@([a-z0-9_]{3,20})$/i.exec(decodeURIComponent(hash));
  return m?.[1].toLowerCase();
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

const COLUMNS = 'id,username,display_name,bio,avatar_url,avatar_color,accent,visibility,showcase,updated_at';

export async function loadMyProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', uid).maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

/** A profile you're allowed to see, or null when it's private or doesn't exist. */
export async function loadProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('username', username.toLowerCase()).maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export class UsernameTaken extends Error {}

export async function saveProfile(p: Profile): Promise<Profile> {
  const { updated_at: _u, ...row } = p;
  void _u;
  const { data, error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' }).select(COLUMNS).single();
  if (error) {
    if (error.code === '23505') throw new UsernameTaken('That username is taken. Try another one.');
    throw error;
  }
  return data as Profile;
}

/** Only the showcase, quietly, when your library changes. */
export async function saveShowcase(uid: string, showcase: Showcase) {
  const { error } = await supabase.from('profiles').update({ showcase }).eq('id', uid);
  if (error) throw error;
}

/** Squares and shrinks a photo to 320px before uploading, so it loads fast. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that picture.'))), 'image/jpeg', 0.86));
}

export async function uploadAvatar(uid: string, file: File, old?: string | null): Promise<string> {
  const blob = await shrink(file);
  const path = `${uid}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  if (old) {
    const prev = old.split('/avatars/')[1];
    if (prev?.startsWith(`${uid}/`)) void supabase.storage.from('avatars').remove([prev]);
  }
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

const item = (b: Book, pct?: number): ShowcaseItem => ({
  id: b.id,
  title: b.title,
  by: b.authors[0],
  // Covers you uploaded yourself are kept in this browser only, so they can't be shared.
  cover: b.coverUrl?.startsWith('http') ? b.coverUrl : undefined,
  pct,
});

/** The snapshot of your library that your profile shows. */
export function buildShowcase(allBooks: Book[], readings: Reading[], spins: Spin[], topIds: { books: string[]; records: string[] }): Showcase {
  const byId = new Map(allBooks.map((b) => [b.id, b]));
  const year = new Date().getFullYear();
  const owned = allBooks.filter((b) => b.owned !== false);
  const finished = readings.filter((r) => r.status === 'read' && r.finishedOn?.startsWith(String(year)));
  const reading = allBooks
    .map((b) => ({ b, r: currentReading(readings, b.id) }))
    .filter(({ r }) => r?.status === 'reading')
    .sort((x, y) => (y.r!.updatedAt ?? '').localeCompare(x.r!.updatedAt ?? ''))
    .slice(0, 3)
    .map(({ b, r }) => item(b, progressPct(r, b)));
  const now = nowSpinning(spins);
  const spinningBook = now && byId.get(now.bookId);
  return {
    topBooks: topIds.books.map((id) => byId.get(id)).filter((b): b is Book => !!b).slice(0, 4).map((b) => item(b)),
    topRecords: topIds.records.map((id) => byId.get(id)).filter((b): b is Book => !!b).slice(0, 4).map((b) => item(b)),
    reading,
    spinning: spinningBook ? item(spinningBook) : undefined,
    stats: {
      books: owned.filter((b) => !isMusic(b)).length,
      records: owned.filter(isMusic).length,
      readThisYear: finished.length,
      pagesThisYear: finished.reduce((n, r) => n + (byId.get(r.bookId)?.pageCount ?? 0), 0),
      year,
    },
  };
}
