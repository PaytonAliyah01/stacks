import type { ItemKind } from '../types';
import { supabase } from './cloud';
import type { Found } from './friends';
import type { LoanItem } from './lending';

/** Wishlist gifts: friends secretly mark what they're getting you. */
export interface WishItem {
  id: string;
  kind: ItemKind;
  title: string;
  author: string | null;
  cover: string | null;
  year: string | null;
  isbn: string | null;
  claimed_by_me: boolean;
  /** The friend who's getting it, or null. */
  claimed_by: string | null;
  /** Your own note, on ones you claimed. */
  note: string | null;
}

export interface GiftClaim {
  owner: string;
  item_id: string;
  item: LoanItem;
  note: string;
  created_at: string;
  /** False once they bought it themselves or took it off their list. */
  still_wanted: boolean;
  friend: Found;
}

const notSetUp = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === 'PGRST204' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42703' || /does not exist|schema cache/i.test(e.message ?? '');
export class GiftsNotReady extends Error {
  constructor() {
    super('Wishlist gifts aren’t set up on the server yet (run supabase/10-gifts.sql).');
  }
}
function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (notSetUp(error)) throw new GiftsNotReady();
  throw error;
}

export async function friendWishlist(friendId: string): Promise<WishItem[]> {
  const { data, error } = await supabase.rpc('friend_wishlist', { friend: friendId });
  check(error);
  return (data as WishItem[]) ?? [];
}

export async function myGiftClaims(): Promise<GiftClaim[]> {
  const { data, error } = await supabase.rpc('my_gift_claims');
  check(error);
  return (data as GiftClaim[]) ?? [];
}

export async function claimGift(uid: string, owner: string, w: WishItem, note = '') {
  const item: LoanItem = { title: w.title, by: w.author ?? undefined, cover: w.cover ?? undefined, kind: w.kind };
  const { error } = await supabase.from('gift_claims').insert({ owner, item_id: w.id, claimer: uid, item, note: note.trim().slice(0, 200) });
  if (error?.code === '23505') throw new Error('Someone else just said they’re getting this one.');
  check(error);
}

export async function setGiftNote(owner: string, itemId: string, note: string) {
  const { error } = await supabase.from('gift_claims').update({ note: note.trim().slice(0, 200) }).eq('owner', owner).eq('item_id', itemId);
  check(error);
}

export async function unclaimGift(owner: string, itemId: string) {
  const { error } = await supabase.from('gift_claims').delete().eq('owner', owner).eq('item_id', itemId);
  check(error);
}

export async function getWishlistOpen(uid: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('wishlist_open').eq('id', uid).maybeSingle();
  check(error);
  return (data as { wishlist_open?: boolean } | null)?.wishlist_open !== false;
}

export async function setWishlistOpen(uid: string, open: boolean) {
  const { error } = await supabase.from('profiles').update({ wishlist_open: open }).eq('id', uid);
  check(error);
}
