import { supabase } from './cloud';
import type { BuddyBook, BuddyRead } from './buddy';
export { buddyBookOf as clubBookOf } from './buddy';

/** Book clubs: friends reading one book at a time, meeting about it, and voting on the next. */
export interface ClubMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  status: 'invited' | 'joined';
  joined_at: string;
}

export interface ClubBook {
  read_id: string;
  book: BuddyBook;
  created_at: string;
  meet_at: string | null;
  meet_where: string | null;
  finished: number;
  rating: number | null;
}

export interface ClubSuggestion {
  id: string;
  book: BuddyBook;
  note: string;
  user_id: string;
  by: string;
  created_at: string;
  votes: number;
  voted: boolean;
}

export interface Club {
  id: string;
  owner: string;
  name: string;
  about: string;
  created_at: string;
  members: ClubMember[];
  /** Every book the club picked, newest (the one you're reading now) first. */
  books: ClubBook[];
  suggestions: ClubSuggestion[];
}

const notSetUp = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === 'PGRST204' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42703' || /does not exist|schema cache/i.test(e.message ?? '');
export class ClubsNotReady extends Error {
  constructor() {
    super('Book clubs aren’t set up on the server yet (run supabase/09-book-clubs.sql).');
  }
}
function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (notSetUp(error)) throw new ClubsNotReady();
  throw error;
}

export async function listClubs(): Promise<Club[]> {
  const { data, error } = await supabase.rpc('my_clubs');
  check(error);
  return (data as Club[]) ?? [];
}

export async function startClub(uid: string, name: string, about: string, friendIds: string[]): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('clubs').insert({ id, owner: uid, name: name.trim(), about: about.trim() });
  check(error);
  const { error: e2 } = await supabase.from('club_members').insert({ club_id: id, user_id: uid, status: 'joined' });
  check(e2);
  await inviteToClub(id, uid, friendIds);
  return id;
}

export async function updateClub(id: string, name: string, about: string) {
  const { error } = await supabase.from('clubs').update({ name: name.trim(), about: about.trim() }).eq('id', id);
  check(error);
}

export async function inviteToClub(id: string, uid: string, friendIds: string[]) {
  if (!friendIds.length) return;
  const { error } = await supabase.from('club_members').insert(friendIds.map((f) => ({ club_id: id, user_id: f, status: 'invited', invited_by: uid })));
  if (error && error.code !== '23505') check(error);
}

/** Join a club, and the book it's reading now. */
export async function joinClub(club: Club, uid: string) {
  const { error } = await supabase
    .from('club_members')
    .update({ status: 'joined', joined_at: new Date().toISOString() })
    .eq('club_id', club.id)
    .eq('user_id', uid);
  check(error);
  const now = club.books[0];
  if (now) {
    const { error: e2 } = await supabase.from('buddy_members').insert({ read_id: now.read_id, user_id: uid, status: 'invited' });
    if (e2 && e2.code !== '23505') check(e2);
  }
}

/** Decline an invite, leave, or (for the host) remove someone. */
export async function leaveClub(id: string, userId: string) {
  const { error } = await supabase.from('club_members').delete().eq('club_id', id).eq('user_id', userId);
  check(error);
}

export async function deleteClub(id: string) {
  const { error } = await supabase.from('clubs').delete().eq('id', id);
  check(error);
}

export async function suggestBook(club: Club, uid: string, book: BuddyBook, note: string) {
  const { error } = await supabase.from('club_suggestions').insert({ club_id: club.id, user_id: uid, book, note: note.trim() });
  check(error);
}

export async function removeSuggestion(id: string) {
  const { error } = await supabase.from('club_suggestions').delete().eq('id', id);
  check(error);
}

export async function vote(s: ClubSuggestion, uid: string) {
  const { error } = s.voted
    ? await supabase.from('club_votes').delete().eq('suggestion_id', s.id).eq('user_id', uid)
    : await supabase.from('club_votes').insert({ suggestion_id: s.id, user_id: uid });
  if (error && error.code !== '23505') check(error);
}

export interface Meeting {
  meet_at: string | null;
  meet_where: string;
}

/**
 * The host picks the club's next book: it becomes a buddy read with everyone
 * in the club invited (the host too), and each person joins when they start it.
 */
export async function pickBook(club: Club, uid: string, book: BuddyBook, meeting: Meeting, fromSuggestion?: string) {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('buddy_reads').insert({
    id,
    owner: uid,
    book,
    note: '',
    club_id: club.id,
    meet_at: meeting.meet_at,
    meet_where: meeting.meet_where.trim() || null,
  });
  check(error);
  const everyone = [uid, ...club.members.filter((m) => m.user_id !== uid).map((m) => m.user_id)];
  const { error: e2 } = await supabase.from('buddy_members').insert(everyone.map((u) => ({ read_id: id, user_id: u, status: 'invited' })));
  check(e2);
  if (fromSuggestion) await removeSuggestion(fromSuggestion).catch(() => undefined);
  return id;
}

export async function setMeeting(readId: string, meeting: Meeting) {
  const { error } = await supabase.from('buddy_reads').update({ meet_at: meeting.meet_at, meet_where: meeting.meet_where.trim() || null }).eq('id', readId);
  check(error);
}


export const memberName = (m: Pick<ClubMember, 'display_name' | 'username'>) => m.display_name || `@${m.username}`;

/** The buddy read behind the club's current book, if you're in it. */
export const currentRead = (club: Club, reads: BuddyRead[]) => (club.books[0] ? reads.find((r) => r.id === club.books[0].read_id) : undefined);

/** "Thursday 14 November, 19:30", or "in 3 days" style hints. */
export function meetingLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

export function meetingSoon(iso: string, now = Date.now()): string | undefined {
  const ms = Date.parse(iso) - now;
  if (ms < -3 * 3_600_000) return 'past';
  if (ms < 0) return 'now';
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
