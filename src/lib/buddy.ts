import type { Book } from '../types';
import { supabase } from './cloud';

/** Reading one book together with friends. */
export interface BuddyBook {
  title: string;
  by?: string;
  cover?: string;
  isbn13?: string;
  pages?: number;
}

export interface BuddyMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  status: 'invited' | 'joined';
  /** Only filled in for you: the book in your own library. */
  book_id?: string | null;
  page?: number | null;
  pct?: number | null;
  finished_at?: string | null;
  rating?: number | null;
  updated_at: string;
}

export interface BuddyRead {
  id: string;
  owner: string;
  book: BuddyBook;
  note: string;
  finish_by: string | null;
  created_at: string;
  members: BuddyMember[];
}

export interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  body: string;
  page: number | null;
  created_at: string;
}

export const buddyBookOf = (b: Book): BuddyBook => ({
  title: b.title,
  by: b.authors[0],
  cover: b.coverUrl?.startsWith('http') ? b.coverUrl : undefined,
  isbn13: b.isbn13,
  pages: b.pageCount,
});

/** Your own book for a buddy read: the one you linked, else the same ISBN, else the same title and author. */
export function findLocalBook(read: BuddyRead, me: BuddyMember | undefined, books: Book[]): Book | undefined {
  const byId = me?.book_id && books.find((b) => b.id === me.book_id);
  if (byId) return byId;
  const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    (read.book.isbn13 && books.find((b) => b.isbn13 === read.book.isbn13)) ||
    books.find((b) => norm(b.title) === norm(read.book.title) && norm(b.authors[0]) === norm(read.book.by)) ||
    undefined
  );
}

export async function listBuddyReads(): Promise<BuddyRead[]> {
  const { data, error } = await supabase.rpc('my_buddy_reads');
  if (error) throw error;
  return (data as BuddyRead[]) ?? [];
}

export async function startBuddyRead(uid: string, book: Book, friendIds: string[], note: string, finishBy?: string, progress?: Progress) {
  const { data, error } = await supabase
    .from('buddy_reads')
    .insert({ owner: uid, book: buddyBookOf(book), note: note.trim(), finish_by: finishBy || null })
    .select('id')
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  const rows = [
    { read_id: id, user_id: uid, status: 'joined', book_id: book.id, ...progressRow(progress) },
    ...friendIds.map((f) => ({ read_id: id, user_id: f, status: 'invited' })),
  ];
  const { error: e2 } = await supabase.from('buddy_members').insert(rows);
  if (e2) throw e2;
  return id;
}

export interface Progress {
  page?: number;
  pct?: number;
  finished?: boolean;
  rating?: number;
}
const progressRow = (p?: Progress) =>
  p
    ? {
        page: p.page ?? null,
        pct: p.pct ?? (p.finished ? 100 : null),
        finished_at: p.finished ? new Date().toISOString() : null,
        rating: p.rating ?? null,
      }
    : {};

export async function joinBuddyRead(readId: string, uid: string, bookId: string, progress?: Progress) {
  const { error } = await supabase
    .from('buddy_members')
    .update({ status: 'joined', book_id: bookId, updated_at: new Date().toISOString(), ...progressRow(progress) })
    .eq('read_id', readId)
    .eq('user_id', uid);
  if (error) throw error;
}

/** Decline an invite, or leave a read you joined. */
export async function leaveBuddyRead(readId: string, uid: string) {
  const { error } = await supabase.from('buddy_members').delete().eq('read_id', readId).eq('user_id', uid);
  if (error) throw error;
}

export async function deleteBuddyRead(readId: string) {
  const { error } = await supabase.from('buddy_reads').delete().eq('id', readId);
  if (error) throw error;
}

export async function inviteMore(readId: string, friendIds: string[]) {
  if (!friendIds.length) return;
  const { error } = await supabase.from('buddy_members').insert(friendIds.map((f) => ({ read_id: readId, user_id: f, status: 'invited' })));
  if (error && error.code !== '23505') throw error;
}

/** Your progress, sent whenever you update the book in your own library. Keeps the first finish time. */
export async function sendProgress(readId: string, uid: string, p: Progress, finishedBefore?: string | null) {
  const row = progressRow(p);
  if (p.finished && finishedBefore) row.finished_at = finishedBefore;
  const { error } = await supabase
    .from('buddy_members')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('read_id', readId)
    .eq('user_id', uid);
  if (error) throw error;
}

export async function loadChat(readId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.rpc('buddy_chat', { rid: readId });
  if (error) throw error;
  return (data as ChatMessage[]) ?? [];
}

export async function sendMessage(readId: string, uid: string, body: string, page?: number) {
  const { error } = await supabase.from('buddy_messages').insert({ read_id: readId, user_id: uid, body: body.trim(), page: page ?? null });
  if (error) throw error;
}

export async function deleteMessage(id: string) {
  const { error } = await supabase.from('buddy_messages').delete().eq('id', id);
  if (error) throw error;
}

export const memberName = (m: Pick<BuddyMember, 'display_name' | 'username'>) => m.display_name || `@${m.username}`;

/** How far someone is, 0–100, from their page or percent. */
export function memberPct(m: BuddyMember, pages?: number): number {
  if (m.finished_at) return 100;
  if (m.pct != null) return m.pct;
  if (m.page != null && pages) return Math.min(100, Math.round((m.page / pages) * 100));
  return 0;
}
