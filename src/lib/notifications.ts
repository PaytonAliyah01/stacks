import type { Friend } from './friends';
import type { Loan } from './lending';
import type { BuddyRead } from './buddy';
import type { Club } from './clubs';
import type { GroupChallenge } from './groupchallenges';
import type { Release } from './newreleases';
import { daysLeft } from './lending';
import { meetingLabel, meetingSoon } from './clubs';

/** Everything waiting for you, gathered from what Stacks already loads. */
export type NotifTarget = 'people' | 'lending' | 'buddy' | 'clubs' | 'groups' | 'newbooks' | 'newmusic';

export interface Notif {
  /** Stays the same for the same event, so "read" sticks. Changes when the event changes (a new due date). */
  id: string;
  icon: string;
  text: string;
  detail?: string;
  /** For sorting, newest first. */
  at: string;
  target: NotifTarget;
  /** Needs you to do something (accept, answer, join), not just news. */
  action?: boolean;
}

const nameOf = (p: { display_name?: string | null; username: string }) => p.display_name || `@${p.username}`;
const DAY = 86_400_000;
const recent = (iso: string | null | undefined, days: number, now: number) => !!iso && now - Date.parse(iso) < days * DAY;

export interface NotifInput {
  uid: string;
  friends: Friend[];
  loans: Loan[];
  buddyReads: BuddyRead[];
  clubs: Club[];
  groups: GroupChallenge[];
  releases: { books: Release[]; music: Release[] };
  /** Releases you've already looked at. */
  seenReleases: Set<string>;
  now?: number;
}

interface Ctx {
  uid: string;
  now: number;
  nowIso: string;
}

function friendNotifs(friends: Friend[]): Notif[] {
  return friends
    .filter((f) => f.status === 'pending' && f.incoming)
    .map((f) => ({ id: `friend:${f.id}`, icon: '👋', text: `${nameOf(f)} wants to be friends`, at: f.since, target: 'people', action: true }));
}

function dueNotifs(l: Loan, who: string, c: Ctx): Notif[] {
  if (l.status !== 'lent' || !l.due_on) return [];
  const out: Notif[] = [];
  const left = daysLeft(l.due_on) ?? 99;
  if (l.borrower === c.uid && left <= 3)
    out.push({ id: `due:${l.id}:${l.due_on}:${left < 0 ? 'late' : 'soon'}`, icon: '⏰', text: dueText(l.item.title, who, left), at: c.nowIso, target: 'lending' });
  if (l.owner === c.uid && left < 0)
    out.push({ id: `late:${l.id}:${l.due_on}`, icon: '⏰', text: `${who} still has your “${l.item.title}” (it was due back)`, at: `${l.due_on}T12:00:00Z`, target: 'lending' });
  return out;
}

function loanNotifs(l: Loan, c: Ctx): Notif[] {
  const who = nameOf(l.other);
  const out: Notif[] = [];
  const mine = l.borrower === c.uid;
  if (l.owner === c.uid && l.status === 'requested')
    out.push({ id: `ask:${l.id}`, icon: '📚', text: `${who} asks to borrow “${l.item.title}”`, detail: l.note || undefined, at: l.created_at, target: 'lending', action: true });
  if (mine && l.status === 'lent' && l.lent_at && recent(l.lent_at, 14, c.now))
    out.push({ id: `lent:${l.id}`, icon: '🤝', text: `${who} said yes: you can borrow “${l.item.title}”`, detail: l.reply || undefined, at: l.lent_at, target: 'lending' });
  if (mine && l.status === 'declined' && recent(l.returned_at ?? l.created_at, 14, c.now))
    out.push({ id: `declined:${l.id}`, icon: '📕', text: `${who} can't lend “${l.item.title}” right now`, detail: l.reply || undefined, at: l.created_at, target: 'lending' });
  return [...out, ...dueNotifs(l, who, c)];
}

function buddyNotif(r: BuddyRead, uid: string): Notif | undefined {
  if (r.club_id) return undefined;
  const me = r.members.find((m) => m.user_id === uid);
  const owner = r.members.find((m) => m.user_id === r.owner);
  if (me?.status !== 'invited' || !owner) return undefined;
  return { id: `buddy:${r.id}`, icon: '👯', text: `${nameOf(owner)} wants to read “${r.book.title}” with you`, at: r.created_at, target: 'buddy', action: true };
}

const MEETING_SOON = new Set(['today', 'tomorrow', 'now']);

function clubNotifs(club: Club, c: Ctx): Notif[] {
  const me = club.members.find((m) => m.user_id === c.uid);
  if (me?.status === 'invited') {
    const host = club.members.find((m) => m.user_id === club.owner);
    return [{ id: `club:${club.id}`, icon: '☕', text: `${host ? nameOf(host) : 'A friend'} invited you to the book club ${club.name}`, at: me.joined_at ?? club.created_at, target: 'clubs', action: true }];
  }
  const now0 = club.books[0];
  if (!now0) return [];
  const out: Notif[] = [];
  if (club.owner !== c.uid && recent(now0.created_at, 14, c.now))
    out.push({ id: `clubbook:${now0.read_id}`, icon: '📖', text: `${club.name} is reading “${now0.book.title}” next`, at: now0.created_at, target: 'clubs' });
  const soon = now0.meet_at ? meetingSoon(now0.meet_at, c.now) : undefined;
  if (now0.meet_at && soon && MEETING_SOON.has(soon))
    out.push({ id: `meet:${now0.read_id}:${now0.meet_at}`, icon: '🗓️', text: `${club.name} meets ${soon}`, detail: [meetingLabel(now0.meet_at), now0.meet_where].filter(Boolean).join(' · '), at: c.nowIso, target: 'clubs' });
  return out;
}

function groupNotif(g: GroupChallenge, uid: string): Notif | undefined {
  const me = g.members.find((m) => m.user_id === uid);
  if (me?.status !== 'invited') return undefined;
  const owner = g.members.find((m) => m.user_id === g.owner);
  return { id: `group:${g.id}`, icon: '🏁', text: `${owner ? nameOf(owner) : 'A friend'} challenged you: ${g.name}`, at: g.created_at, target: 'groups', action: true };
}

const RELEASE_WORDS = {
  books: { icon: '✨', things: 'books', makers: 'authors', target: 'newbooks' },
  music: { icon: '💿', things: 'albums', makers: 'artists', target: 'newmusic' },
} as const;

function releaseNotif(kind: 'books' | 'music', releases: Release[], seen: Set<string>, nowIso: string): Notif | undefined {
  const fresh = releases.filter((r) => !seen.has(r.key));
  if (!fresh.length) return undefined;
  const w = RELEASE_WORDS[kind];
  const first = fresh[0];
  const many = fresh.length > 1;
  return {
    id: `rel:${kind}:${fresh.map((r) => r.key).sort((a, b) => a.localeCompare(b)).join(',')}`,
    icon: w.icon,
    text: many ? `${fresh.length} new ${w.things} from ${w.makers} you follow` : `New from ${first.authors[0]}: “${first.title}”`,
    detail: many ? fresh.slice(0, 3).map((r) => r.title).join(', ') : undefined,
    at: nowIso,
    target: w.target,
  };
}

const present = <T,>(v: T | undefined): v is T => v !== undefined;

export function gatherNotifications(x: NotifInput): Notif[] {
  const now = x.now ?? Date.now();
  const c: Ctx = { uid: x.uid, now, nowIso: new Date(now).toISOString() };
  const out: Notif[] = [
    ...friendNotifs(x.friends),
    ...x.loans.flatMap((l) => loanNotifs(l, c)),
    ...x.buddyReads.map((r) => buddyNotif(r, x.uid)).filter(present),
    ...x.clubs.flatMap((club) => clubNotifs(club, c)),
    ...x.groups.map((g) => groupNotif(g, x.uid)).filter(present),
    ...(['books', 'music'] as const).map((kind) => releaseNotif(kind, x.releases[kind], x.seenReleases, c.nowIso)).filter(present),
  ];
  // Things to do first, then newest first.
  return out.sort((a, b) => Number(!!b.action) - Number(!!a.action) || b.at.localeCompare(a.at));
}

const READ = 'stacks.notif.read';
export function readNotifs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function markNotifsRead(ids: string[]) {
  const s = readNotifs();
  ids.forEach((id) => s.add(id));
  try {
    localStorage.setItem(READ, JSON.stringify([...s].slice(-500)));
  } catch {
    /* full or blocked */
  }
}

export function ago(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)} h ago`;
  const d = Math.floor(ms / DAY);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function dueText(title: string, who: string, left: number): string {
  if (left < 0) return `“${title}” was due back to ${who}`;
  if (left === 0) return `“${title}” is due back to ${who} today`;
  return `“${title}” is due back to ${who} in ${left} day${left === 1 ? '' : 's'}`;
}
