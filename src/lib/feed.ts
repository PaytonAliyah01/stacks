import type { Book } from '../types';
import { isMusic, kindOf } from '../types';
import { supabase } from './cloud';

/**
 * The feed: small posts about what you do ("started", "finished", "spinning"),
 * seen by you and your friends. Your library itself is never shared.
 */
export type ActivityKind = 'started' | 'finished' | 'dnf' | 'rated' | 'spin' | 'added';

export interface ActivityItem {
  title: string;
  by?: string;
  cover?: string;
  kind: 'book' | 'vinyl' | 'cd';
}

export interface FeedEntry {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  kind: ActivityKind;
  items: ActivityItem[];
  extra: { rating?: number; review?: string; count?: number; pages?: number };
  created_at: string;
  likes: number;
  liked: boolean;
}

let me: { uid: string; share: boolean } | null = null;
/** Who's posting, and whether they share activity at all. Set when the profile loads. */
export function setFeedIdentity(x: { uid: string; share: boolean } | null) {
  me = x;
}

export const itemOf = (b: Book): ActivityItem => ({
  title: b.title,
  by: b.authors[0],
  cover: b.coverUrl?.startsWith('http') ? b.coverUrl : undefined,
  kind: kindOf(b),
});

export async function post(kind: ActivityKind, items: ActivityItem[], extra: FeedEntry['extra'] = {}) {
  if (!me?.share || !items.length) return;
  const { error } = await supabase.from('activity').insert({ user_id: me.uid, kind, items, extra });
  if (error) console.warn('Stacks feed:', error.message);
}

// One post for a stack of scans, not one per book.
let added: ActivityItem[] = [];
let addTimer: number | undefined;
export function postAdded(b: Book) {
  if (!me?.share) return;
  added.push(itemOf(b));
  clearTimeout(addTimer);
  addTimer = window.setTimeout(() => {
    const list = added;
    added = [];
    void post('added', list.slice(0, 6), { count: list.length });
  }, 45_000);
}
window.addEventListener('pagehide', () => {
  if (added.length) void post('added', added.slice(0, 6), { count: added.length });
  added = [];
});

// Putting the same record on twice in an hour is one post.
const lastSpin = new Map<string, number>();
export function postSpin(b: Book) {
  if (!isMusic(b)) return;
  const t = lastSpin.get(b.id);
  if (t && Date.now() - t < 3_600_000) return;
  lastSpin.set(b.id, Date.now());
  void post('spin', [itemOf(b)]);
}

export async function loadFeed(before?: string): Promise<FeedEntry[]> {
  const { data, error } = await supabase.rpc('friend_feed', { before: before ?? new Date().toISOString(), max_rows: 40 });
  if (error) throw error;
  return (data as FeedEntry[]) ?? [];
}

export async function setLiked(id: string, liked: boolean) {
  const q = liked
    ? supabase.from('activity_likes').insert({ activity_id: id, user_id: me?.uid })
    : supabase.from('activity_likes').delete().eq('activity_id', id).eq('user_id', me?.uid ?? '');
  const { error } = await q;
  if (error && error.code !== '23505') throw error;
}

export async function deleteActivity(id: string) {
  const { error } = await supabase.from('activity').delete().eq('id', id);
  if (error) throw error;
}

/** "finished", "is spinning"… the sentence for a post. */
export function sentence(e: Pick<FeedEntry, 'kind' | 'items' | 'extra'>): string {
  const what = e.items[0];
  switch (e.kind) {
    case 'started':
      return 'started reading';
    case 'finished':
      return 'finished';
    case 'dnf':
      return 'put down';
    case 'rated':
      return 'rated';
    case 'spin':
      return what?.kind === 'cd' ? 'is listening to' : 'is spinning';
    case 'added': {
      const n = e.extra.count ?? e.items.length;
      const music = e.items.every((x) => x.kind !== 'book');
      return `added ${n} ${music ? (n === 1 ? 'record' : 'records') : n === 1 ? 'book' : 'books'} to their shelves`;
    }
  }
}
