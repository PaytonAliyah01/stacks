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
const DAY = 86400_000;
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

export function gatherNotifications(x: NotifInput): Notif[] {
  const now = x.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const out: Notif[] = [];

  for (const f of x.friends)
    if (f.status === 'pending' && f.incoming)
      out.push({ id: `friend:${f.id}`, icon: '👋', text: `${nameOf(f)} wants to be friends`, at: f.since, target: 'people', action: true });

  for (const l of x.loans) {
    const who = nameOf(l.other);
    if (l.owner === x.uid && l.status === 'requested')
      out.push({ id: `ask:${l.id}`, icon: '📚', text: `${who} asks to borrow “${l.item.title}”`, detail: l.note || undefined, at: l.created_at, target: 'lending', action: true });
    if (l.borrower === x.uid && l.status === 'lent' && recent(l.lent_at, 14, now))
      out.push({ id: `lent:${l.id}`, icon: '🤝', text: `${who} said yes: you can borrow “${l.item.title}”`, detail: l.reply || undefined, at: l.lent_at!, target: 'lending' });
    if (l.borrower === x.uid && l.status === 'declined' && recent(l.returned_at ?? l.created_at, 14, now))
      out.push({ id: `declined:${l.id}`, icon: '📕', text: `${who} can't lend “${l.item.title}” right now`, detail: l.reply || undefined, at: l.created_at, target: 'lending' });
    if (l.status === 'lent' && l.due_on) {
      const left = daysLeft(l.due_on) ?? 99;
      if (l.borrower === x.uid && left <= 3)
        out.push({
          id: `due:${l.id}:${l.due_on}:${left < 0 ? 'late' : 'soon'}`,
          icon: '⏰',
          text: left < 0 ? `“${l.item.title}” was due back to ${who}` : left === 0 ? `“${l.item.title}” is due back to ${who} today` : `“${l.item.title}” is due back to ${who} in ${left} day${left === 1 ? '' : 's'}`,
          at: nowIso,
          target: 'lending',
        });
      if (l.owner === x.uid && left < 0)
        out.push({ id: `late:${l.id}:${l.due_on}`, icon: '⏰', text: `${who} still has your “${l.item.title}” (it was due back)`, at: `${l.due_on}T12:00:00Z`, target: 'lending' });
    }
  }

  for (const r of x.buddyReads) {
    if (r.club_id) continue;
    const me = r.members.find((m) => m.user_id === x.uid);
    const owner = r.members.find((m) => m.user_id === r.owner);
    if (me?.status === 'invited' && owner)
      out.push({ id: `buddy:${r.id}`, icon: '👯', text: `${nameOf(owner)} wants to read “${r.book.title}” with you`, at: r.created_at, target: 'buddy', action: true });
  }

  for (const c of x.clubs) {
    const me = c.members.find((m) => m.user_id === x.uid);
    const host = c.members.find((m) => m.user_id === c.owner);
    if (me?.status === 'invited') {
      out.push({ id: `club:${c.id}`, icon: '☕', text: `${host ? nameOf(host) : 'A friend'} invited you to the book club ${c.name}`, at: me.joined_at ?? c.created_at, target: 'clubs', action: true });
      continue;
    }
    const now0 = c.books[0];
    if (!now0) continue;
    if (c.owner !== x.uid && recent(now0.created_at, 14, now))
      out.push({ id: `clubbook:${now0.read_id}`, icon: '📖', text: `${c.name} is reading “${now0.book.title}” next`, at: now0.created_at, target: 'clubs' });
    if (now0.meet_at) {
      const soon = meetingSoon(now0.meet_at, now);
      if (soon === 'today' || soon === 'tomorrow' || soon === 'now')
        out.push({ id: `meet:${now0.read_id}:${now0.meet_at}`, icon: '🗓️', text: `${c.name} meets ${soon === 'now' ? 'now' : soon}`, detail: [meetingLabel(now0.meet_at), now0.meet_where].filter(Boolean).join(' · '), at: nowIso, target: 'clubs' });
    }
  }

  for (const g of x.groups) {
    const me = g.members.find((m) => m.user_id === x.uid);
    const owner = g.members.find((m) => m.user_id === g.owner);
    if (me?.status === 'invited')
      out.push({ id: `group:${g.id}`, icon: '🏁', text: `${owner ? nameOf(owner) : 'A friend'} challenged you: ${g.name}`, at: g.created_at, target: 'groups', action: true });
  }

  for (const kind of ['books', 'music'] as const) {
    const fresh = x.releases[kind].filter((r) => !x.seenReleases.has(r.key));
    if (!fresh.length) continue;
    const first = fresh[0];
    out.push({
      id: `rel:${kind}:${fresh.map((r) => r.key).sort().join(',')}`,
      icon: kind === 'books' ? '✨' : '💿',
      text:
        fresh.length === 1
          ? `New from ${first.authors[0]}: “${first.title}”`
          : `${fresh.length} new ${kind === 'books' ? 'books' : 'albums'} from ${kind === 'books' ? 'authors' : 'artists'} you follow`,
      detail: fresh.length > 1 ? fresh.slice(0, 3).map((r) => r.title).join(', ') : undefined,
      at: nowIso,
      target: kind === 'books' ? 'newbooks' : 'newmusic',
    });
  }

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
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / 3600_000)} h ago`;
  const d = Math.floor(ms / DAY);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
