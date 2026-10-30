import type { Book, ItemKind } from '../types';
import { kindOf } from '../types';
import { supabase } from './cloud';
import type { Found } from './friends';

/** Lending between friends: asking to borrow, saying yes, and getting it back. */
export type LoanStatus = 'requested' | 'lent' | 'returned' | 'declined' | 'cancelled';

export interface LoanItem {
  title: string;
  by?: string;
  cover?: string;
  kind: ItemKind;
}

export interface Loan {
  id: string;
  owner: string;
  borrower: string;
  item_id: string;
  item: LoanItem;
  status: LoanStatus;
  note: string;
  reply: string;
  due_on: string | null;
  created_at: string;
  lent_at: string | null;
  returned_at: string | null;
  /** The friend on the other side. */
  other: Found;
}

/** A book or record on a friend's shelves. */
export interface ShelfItem {
  id: string;
  kind: ItemKind;
  title: string;
  author: string | null;
  cover: string | null;
  year: string | null;
  /** Lent to someone right now. */
  lent_out: boolean;
}

export const loanItemOf = (b: Book): LoanItem => ({
  title: b.title,
  by: b.authors[0],
  cover: b.coverUrl?.startsWith('https://') ? b.coverUrl : undefined,
  kind: kindOf(b),
});

/** Before the lending SQL has been run, Supabase doesn't know these tables. */
const notSetUp = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === 'PGRST204' || e.code === '42P01' || e.code === '42703' || /does not exist|schema cache/i.test(e.message ?? '');
export class LendingNotReady extends Error {
  constructor() {
    super('Lending isn’t set up on the server yet (run supabase/06-lending.sql).');
  }
}
function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (notSetUp(error)) throw new LendingNotReady();
  throw error;
}

export async function listLoans(): Promise<Loan[]> {
  const { data, error } = await supabase.rpc('my_loans');
  check(error);
  return (data as Loan[]) ?? [];
}

export async function getLendOpen(uid: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('lend_open').eq('id', uid).maybeSingle();
  check(error);
  return !!(data as { lend_open?: boolean } | null)?.lend_open;
}

export async function setLendOpen(uid: string, open: boolean) {
  const { error } = await supabase.from('profiles').update({ lend_open: open }).eq('id', uid);
  check(error);
}

export async function lendingOpen(friend: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('lending_open', { friend });
  check(error);
  return !!data;
}

export async function friendShelf(friend: string): Promise<ShelfItem[]> {
  const { data, error } = await supabase.rpc('friend_shelf', { friend });
  check(error);
  return ((data as ShelfItem[]) ?? []).map((x) => ({ ...x, kind: x.kind ?? 'book' }));
}

export async function askToBorrow(uid: string, owner: string, it: ShelfItem, note: string) {
  const { error } = await supabase.from('loans').insert({
    owner,
    borrower: uid,
    item_id: it.id,
    item: { title: it.title, by: it.author ?? undefined, cover: it.cover ?? undefined, kind: it.kind },
    note: note.trim().slice(0, 300),
  });
  if (error?.code === '23505') throw new Error('You already asked for this one.');
  check(error);
}

export async function cancelAsk(id: string) {
  const { error } = await supabase.from('loans').update({ status: 'cancelled' }).eq('id', id);
  check(error);
}

/** Say yes: it's lent from now until the due date. */
export async function lend(id: string, dueOn: string | null, reply: string) {
  const { error } = await supabase
    .from('loans')
    .update({ status: 'lent', due_on: dueOn || null, reply: reply.trim().slice(0, 300), lent_at: new Date().toISOString() })
    .eq('id', id);
  if (error?.code === '23505') throw new Error('That copy is already lent to someone. Mark it returned first.');
  check(error);
}

export async function decline(id: string, reply: string) {
  const { error } = await supabase.from('loans').update({ status: 'declined', reply: reply.trim().slice(0, 300) }).eq('id', id);
  check(error);
}

/** Lend something straight to a friend, without them asking. */
export async function lendTo(uid: string, friend: string, b: Book, dueOn: string | null): Promise<string> {
  const { data, error } = await supabase
    .from('loans')
    .insert({ owner: uid, borrower: friend, item_id: b.id, item: loanItemOf(b), status: 'lent', due_on: dueOn || null, lent_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error?.code === '23505') throw new Error('That copy is already lent to someone. Mark it returned first.');
  check(error);
  return (data as { id: string }).id;
}

export async function markReturned(id: string) {
  const { error } = await supabase.from('loans').update({ status: 'returned', returned_at: new Date().toISOString() }).eq('id', id);
  check(error);
}

export async function changeDue(id: string, dueOn: string | null) {
  const { error } = await supabase.from('loans').update({ due_on: dueOn || null }).eq('id', id);
  check(error);
}

export const friendName = (f: Pick<Found, 'display_name' | 'username'>) => f.display_name || `@${f.username}`;

/** Days until it's due; negative when overdue. */
export function daysLeft(due: string | null, today = new Date()): number | undefined {
  if (!due) return undefined;
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.parse(`${due}T00:00:00Z`) - t) / 86400_000);
}

export function dueLabel(due: string | null): string {
  const d = daysLeft(due);
  if (d === undefined) return 'No due date';
  if (d < -1) return `${-d} days overdue`;
  if (d === -1) return 'Due yesterday';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d < 14) return `Due in ${d} days`;
  return `Due ${new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** A date some weeks from today, as YYYY-MM-DD. */
export function weeksFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
