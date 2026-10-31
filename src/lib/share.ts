import { supabase } from './cloud';
import type { Book, BookFormat, Bookcase, BookSeries, ItemKind, Placement, VinylSize } from '../types';

/** Your shareable shelf link and what it shows. */
export interface ShareLink {
  token: string;
  enabled: boolean;
  title: string;
  show_books: boolean;
  show_music: boolean;
  show_wishlist: boolean;
  show_shelves: boolean;
  show_ratings: boolean;
}
export type ShareSettings = Omit<ShareLink, 'token'>;

export const DEFAULT_SHARE: ShareSettings = { enabled: true, title: '', show_books: true, show_music: true, show_wishlist: false, show_shelves: true, show_ratings: false };

const notSetUp = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || /does not exist|schema cache/i.test(e.message ?? '');
export class ShareNotReady extends Error {
  constructor() {
    super('Shelf links aren’t set up on the server yet (run supabase/11-share-links.sql).');
  }
}
function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (notSetUp(error)) throw new ShareNotReady();
  throw error;
}

export async function getShareLink(): Promise<ShareLink | null> {
  const { data, error } = await supabase.from('shelf_links').select('*').maybeSingle();
  check(error);
  return (data as ShareLink) ?? null;
}

export async function saveShareLink(uid: string, s: ShareSettings): Promise<ShareLink> {
  const { data, error } = await supabase
    .from('shelf_links')
    .upsert({ user_id: uid, ...s, title: s.title.trim().slice(0, 80), updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('*')
    .single();
  check(error);
  return data as ShareLink;
}

/** A new secret: the old link stops working. */
export async function newShareToken(uid: string): Promise<ShareLink> {
  const token = crypto.randomUUID().replace(/-/g, '');
  const { data, error } = await supabase.from('shelf_links').update({ token, updated_at: new Date().toISOString() }).eq('user_id', uid).select('*').single();
  check(error);
  return data as ShareLink;
}

export const shareUrl = (token: string) => `${location.origin}${location.pathname}#shelf/${token}`;
export const tokenFromHash = (hash = location.hash) => /^#shelf\/([0-9a-f]{24,64})$/i.exec(hash)?.[1];

export interface SharedItem {
  id: string;
  kind: ItemKind;
  title: string;
  authors?: string[];
  cover?: string;
  year?: string;
  pages?: number;
  format?: BookFormat;
  copies?: number;
  isbn13?: string;
  discCount?: number;
  vinylSize?: VinylSize;
  series?: BookSeries;
  wanted: boolean;
  placement?: Placement;
  rating?: number;
}
export interface SharedShelf {
  title: string;
  name: string;
  avatar_url: string | null;
  avatar_color: string | null;
  show: { books: boolean; music: boolean; wishlist: boolean; shelves: boolean; ratings: boolean };
  items: SharedItem[];
  bookcases: Bookcase[];
}

/** What someone opening the link sees; null when the link is off or wrong. */
export async function fetchSharedShelf(token: string): Promise<SharedShelf | null> {
  const { data, error } = await supabase.rpc('shared_shelf', { t: token });
  check(error);
  if (!data) return null;
  const s = data as SharedShelf;
  return { ...s, items: (s.items ?? []).map((x) => ({ ...x, kind: x.kind ?? 'book' })), bookcases: s.bookcases ?? [] };
}

/** Enough of a Book to draw it on a shelf. */
export const asBook = (x: SharedItem): Book => ({
  id: x.id,
  kind: x.kind,
  title: x.title,
  authors: x.authors ?? [],
  coverUrl: x.cover,
  publishedDate: x.year,
  pageCount: x.pages,
  format: x.format ?? 'paperback',
  copies: x.copies ?? 1,
  isbn13: x.isbn13,
  discCount: x.discCount,
  vinylSize: x.vinylSize,
  series: x.series,
  placement: x.placement,
  subjects: [],
  sources: [],
  tags: [],
  addedAt: '',
  updatedAt: '',
});
