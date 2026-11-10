import type { Book, Spin } from '../types';
import { kindOf } from '../types';
import { playHours } from './stylus';

export interface MusicWrap {
  year: string;
  spins: number;
  hours: number;
  /** Different records played. */
  records: number;
  days: number;
  longestStreak: number;
  perMonth: number[];
  busiestMonth?: [string, number];
  busiestDay?: [string, number];
  topRecords: { b: Book; n: number }[];
  topArtists: [string, number][];
  added: Book[];
  addedVinyl: number;
  addedCds: number;
  spent: [string, number][];
  priciest?: Book;
  first?: Book;
  last?: Book;
  /** Played for the first time this year, records already in the collection before. */
  rediscovered: number;
}

const local = (iso: string) => new Date(iso);
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Longest run of days in a row with a spin. */
function longestRun(days: Set<string>, year: number): number {
  let longest = 0;
  let run = 0;
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    run = days.has(dayKey(d)) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

function spentByCurrency(added: Book[]): Map<string, number> {
  const spent = new Map<string, number>();
  for (const b of added.filter((x) => x.pricePaid)) spent.set(b.currency ?? '', (spent.get(b.currency ?? '') ?? 0) + (b.pricePaid ?? 0) * Math.max(1, b.copies));
  return spent;
}

/** When each record was first spun, ever. */
function firstSpins(spins: Spin[]): Map<string, string> {
  const firstEver = new Map<string, string>();
  for (const s of spins) {
    const seen = firstEver.get(s.bookId);
    if (!seen || s.at < seen) firstEver.set(s.bookId, s.at);
  }
  return firstEver;
}

export function wrapMusic(year: string, books: Book[], spins: Spin[]): MusicWrap {
  const byId = new Map(books.map((b) => [b.id, b]));
  const inYear = spins
    .filter((s) => byId.has(s.bookId) && String(local(s.at).getFullYear()) === year)
    .sort((a, b) => a.at.localeCompare(b.at));
  const perMonth = new Array(12).fill(0) as number[];
  const perWeekday = new Array(7).fill(0) as number[];
  const counts = new Map<string, number>();
  const artists = new Map<string, number>();
  const days = new Set<string>();
  let hours = 0;
  for (const s of inYear) {
    const d = local(s.at);
    const b = byId.get(s.bookId)!;
    perMonth[d.getMonth()]++;
    perWeekday[d.getDay()]++;
    counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
    if (b.authors[0]) artists.set(b.authors[0], (artists.get(b.authors[0]) ?? 0) + 1);
    days.add(dayKey(d));
    hours += playHours(b);
  }
  const longest = longestRun(days, Number(year));
  const monthName = (i: number) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' });
  const dayName = (i: number) => new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'long' });
  const bm = perMonth.indexOf(Math.max(...perMonth));
  const bd = perWeekday.indexOf(Math.max(...perWeekday));

  const yearOf = (b: Book) => (b.acquiredOn ?? b.addedAt).slice(0, 4);
  const added = books.filter((b) => b.owned !== false && yearOf(b) === year).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const spent = spentByCurrency(added);
  const firstEver = firstSpins(spins);
  const rediscovered = [...counts.keys()].filter((id) => {
    const b = byId.get(id)!;
    return firstEver.get(id)?.slice(0, 4) === year && yearOf(b) < year;
  }).length;

  return {
    year,
    spins: inYear.length,
    hours,
    records: counts.size,
    days: days.size,
    longestStreak: longest,
    perMonth,
    busiestMonth: inYear.length ? [monthName(bm), perMonth[bm]] : undefined,
    busiestDay: inYear.length ? [dayName(bd), perWeekday[bd]] : undefined,
    topRecords: [...counts.entries()]
      .map(([id, n]) => ({ b: byId.get(id)!, n }))
      .sort((a, b) => b.n - a.n || a.b.title.localeCompare(b.b.title))
      .slice(0, 12),
    topArtists: [...artists.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
    added,
    addedVinyl: added.filter((b) => kindOf(b) === 'vinyl').length,
    addedCds: added.filter((b) => kindOf(b) === 'cd').length,
    spent: [...spent.entries()],
    priciest: [...added].filter((b) => b.pricePaid).sort((a, b) => b.pricePaid! - a.pricePaid!)[0],
    first: inYear[0] && byId.get(inYear[0].bookId),
    last: inYear.length ? byId.get(inYear[inYear.length - 1].bookId) : undefined,
    rediscovered,
  };
}
