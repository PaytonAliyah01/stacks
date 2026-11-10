import type { Book, Challenge, Reading } from '../types';
import { todayIso } from './reading';

export interface CountedRead {
  reading: Reading;
  book: Book;
  amount: number; // 1 for a book, its page count for pages
}

export interface ChallengeProgress {
  done: number;
  pct: number;
  /** Where you'd be today if you read at an even pace. */
  expected: number;
  /** How many books (or pages) to read per week from today to finish on time. */
  perWeekNeeded: number;
  daysLeft: number;
  started: boolean;
  ended: boolean;
  reads: CountedRead[]; // oldest first
}

const DAY = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / DAY;

/** Finished reads that count for a challenge: read (not abandoned) and finished inside its dates. */
export function progressOf(c: Challenge, readings: Reading[], books: Map<string, Book>, today = todayIso()): ChallengeProgress {
  const reads: CountedRead[] = [];
  for (const r of readings) {
    if (r.status !== 'read' || !r.finishedOn) continue;
    if (r.finishedOn < c.startOn || r.finishedOn > c.endOn) continue;
    const book = books.get(r.bookId);
    if (!book) continue;
    reads.push({ reading: r, book, amount: c.measure === 'books' ? 1 : book.pageCount ?? 0 });
  }
  reads.sort((a, b) => a.reading.finishedOn!.localeCompare(b.reading.finishedOn!));
  const done = reads.reduce((n, x) => n + x.amount, 0);
  const total = dayNum(c.endOn) - dayNum(c.startOn) + 1;
  const elapsed = Math.max(0, Math.min(total, dayNum(today) - dayNum(c.startOn) + 1));
  const daysLeft = Math.max(0, total - elapsed);
  const left = Math.max(0, c.goal - done);
  return {
    done,
    pct: c.goal > 0 ? Math.round((done / c.goal) * 100) : 0,
    expected: (c.goal * elapsed) / total,
    perWeekNeeded: daysLeft > 0 ? (left / daysLeft) * 7 : left,
    daysLeft,
    started: today >= c.startOn,
    ended: today > c.endOn,
    reads,
  };
}

export interface BadgeDef {
  id: string;
  name: string;
  /** Short mark drawn on the medal. */
  mark: string;
  description: (c: Challenge) => string;
  /** The day it was earned, or null if not yet. */
  earnedOn: (c: Challenge, p: ChallengeProgress, today: string) => string | null;
}

/** The day the running total first reached `target`. */
function reachedOn(p: ChallengeProgress, target: number): string | null {
  let sum = 0;
  for (const x of p.reads) {
    sum += x.amount;
    if (sum >= target) return x.reading.finishedOn!;
  }
  return null;
}

const unit = (c: Challenge) => (c.measure === 'books' ? 'book' : 'page');

const milestone = (id: string, name: string, mark: string, share: number): BadgeDef => ({
  id,
  name,
  mark,
  description: (c) => `Reach ${Math.ceil(c.goal * share).toLocaleString()} ${unit(c)}s.`,
  earnedOn: (c, p) => reachedOn(p, Math.max(1, Math.ceil(c.goal * share))),
});

export const BADGES: BadgeDef[] = [
  {
    id: 'first',
    name: 'Off the mark',
    mark: '1',
    description: () => 'Finish your first book in this challenge.',
    earnedOn: (_c, p) => p.reads[0]?.reading.finishedOn ?? null,
  },
  milestone('quarter', 'Quarter way', '¼', 0.25),
  milestone('half', 'Halfway there', '½', 0.5),
  milestone('three-quarters', 'Home stretch', '¾', 0.75),
  milestone('goal', 'Goal reached', '★', 1),
  milestone('over', 'Overachiever', '+', 1.25),
  {
    id: 'ahead',
    name: 'Ahead of pace',
    mark: '»',
    description: (c) => `Get ${c.measure === 'books' ? 'a whole book' : 'a week of pages'} ahead of an even pace.`,
    earnedOn: (c, p, today) => {
      if (!p.started || p.ended || p.done === 0) return null;
      const weekOfPages = (c.goal / Math.max(1, dayNum(c.endOn) - dayNum(c.startOn) + 1)) * 7;
      return p.done - p.expected >= (c.measure === 'books' ? 1 : weekOfPages) ? today : null;
    },
  },
  {
    id: 'streak',
    name: 'Three-month streak',
    mark: '3',
    description: () => 'Finish a book in three months in a row.',
    earnedOn: (_c, p) => {
      const months = [...new Set(p.reads.map((x) => x.reading.finishedOn!.slice(0, 7)))].sort((a, b) => a.localeCompare(b));
      const idx = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
      for (let i = 2; i < months.length; i++) {
        if (idx(months[i]) - idx(months[i - 2]) === 2) {
          return p.reads.find((x) => x.reading.finishedOn!.startsWith(months[i]))!.reading.finishedOn!;
        }
      }
      return null;
    },
  },
  {
    id: 'quick',
    name: 'Page turner',
    mark: '7',
    description: () => 'Finish a book within a week of starting it.',
    earnedOn: (_c, p) =>
      p.reads.find((x) => x.reading.startedOn && dayNum(x.reading.finishedOn!) - dayNum(x.reading.startedOn) <= 7)?.reading.finishedOn ?? null,
  },
  {
    id: 'doorstopper',
    name: 'Doorstopper',
    mark: '500',
    description: () => 'Finish a book of 500 pages or more.',
    earnedOn: (_c, p) => p.reads.find((x) => (x.book.pageCount ?? 0) >= 500)?.reading.finishedOn ?? null,
  },
];

/** Badges newly earned since last time, with the challenge updated to keep them. */
export function awardBadges(c: Challenge, p: ChallengeProgress, today = todayIso()): { challenge: Challenge; earned: BadgeDef[] } {
  const earned: BadgeDef[] = [];
  const badges = { ...c.badges };
  for (const b of BADGES) {
    if (badges[b.id]) continue;
    const on = b.earnedOn(c, p, today);
    if (on) {
      badges[b.id] = on;
      earned.push(b);
    }
  }
  return { challenge: earned.length ? { ...c, badges, updatedAt: new Date().toISOString() } : c, earned };
}
