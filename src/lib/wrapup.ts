import type { Book, BookNote, Challenge, Reading } from '../types';
import { progressOf } from './challenges';
import { cap } from './moods';
import { titleWithoutSeries } from './series';

const DAY = 86_400_000;
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }));

export interface Wrap {
  year: string;
  books: number;
  pages: number;
  minutes: number;
  dnf: number;
  rereads: number;
  avgRating?: number;
  favorite?: { book: Book; rating?: number };
  topRated: { book: Book; rating: number }[];
  longest?: Book;
  shortest?: Book;
  fastest?: { book: Book; days: number };
  topAuthor?: [string, number];
  topGenre?: [string, number];
  moods: [string, number][];
  pace?: string;
  busiestMonth?: [string, number];
  perMonth: number[];
  firstBook?: Book;
  lastBook?: Book;
  added: number;
  challenge?: { name: string; done: number; goal: number; unit: string };
  quote?: { note: BookNote; book: Book };
  quotesSaved: number;
  seriesFinished: string[];
  covers: Book[];
}

const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
const tally = (keys: string[][]) => {
  const m = new Map<string, number>();
  for (const ks of keys) for (const k of new Set(ks)) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

/** Everything worth celebrating about one year of reading. */
export function wrapYear(year: string, books: Book[], readings: Reading[], notes: BookNote[], challenges: Challenge[]): Wrap {
  const byId = new Map(books.map((b) => [b.id, b]));
  const done = readings
    .filter((r) => r.finishedOn?.startsWith(year) && byId.has(r.bookId))
    .sort((a, b) => a.finishedOn!.localeCompare(b.finishedOn!));
  const read = done.filter((r) => r.status === 'read').map((r) => ({ r, b: byId.get(r.bookId)! }));
  const pages = read.reduce((n, x) => n + (x.b.pageCount ?? 0), 0);
  const minutes = readings.flatMap((r) => r.sessions ?? []).filter((s) => s.start.startsWith(year)).reduce((n, s) => n + s.minutes, 0);
  const rated = read.filter((x) => x.r.rating).sort((a, b) => b.r.rating! - a.r.rating! || b.r.finishedOn!.localeCompare(a.r.finishedOn!));
  const withPages = read.filter((x) => x.b.pageCount);
  const timed = read
    .filter((x) => x.r.startedOn)
    .map((x) => ({ book: x.b, days: Math.max(1, Math.round((Date.parse(x.r.finishedOn!) - Date.parse(x.r.startedOn!)) / DAY) + 1) }))
    .sort((a, b) => a.days - b.days);
  const perMonth = new Array(12).fill(0);
  for (const x of read) perMonth[Number(x.r.finishedOn!.slice(5, 7)) - 1]++;
  const bm = perMonth.indexOf(Math.max(...perMonth));
  const moodMap = tally(read.map((x) => (x.b.moods ?? []).map(cap)));
  const paceMap = tally(read.map((x) => (x.b.pace ? [x.b.pace] : [])));
  const earlierReads = new Set(readings.filter((r) => r.status === 'read' && r.finishedOn && r.finishedOn < `${year}-01-01`).map((r) => r.bookId));

  // The challenge that covers this year best: one that ends in it, biggest goal first.
  const ch = challenges.filter((c) => c.endOn.startsWith(year)).sort((a, b) => b.goal - a.goal)[0];
  const cp = ch && progressOf(ch, readings, byId, `${year}-12-31`);

  const yearQuotes = notes.filter((n) => n.kind === 'quote' && n.createdAt.startsWith(year) && byId.has(n.bookId));
  const quote = yearQuotes.find((n) => n.favorite) ?? yearQuotes[yearQuotes.length - 1];

  // Series where every numbered book you have is now read, finished this year.
  const seriesFinished: string[] = [];
  const seriesNames = new Set(read.map((x) => x.b.series?.name).filter(Boolean) as string[]);
  for (const name of seriesNames) {
    const inSeries = books.filter((b) => b.series?.name === name);
    const allRead = inSeries.every((b) => readings.some((r) => r.bookId === b.id && r.status === 'read'));
    if (inSeries.length > 1 && allRead) seriesFinished.push(name);
  }

  return {
    year,
    books: read.length,
    pages,
    minutes,
    dnf: done.length - read.length,
    rereads: read.filter((x) => earlierReads.has(x.b.id)).length,
    avgRating: rated.length ? rated.reduce((n, x) => n + x.r.rating!, 0) / rated.length : undefined,
    favorite: rated[0] ? { book: rated[0].b, rating: rated[0].r.rating } : undefined,
    topRated: rated.slice(0, 5).map((x) => ({ book: x.b, rating: x.r.rating! })),
    longest: [...withPages].sort((a, b) => b.b.pageCount! - a.b.pageCount!)[0]?.b,
    shortest: [...withPages].sort((a, b) => a.b.pageCount! - b.b.pageCount!)[0]?.b,
    fastest: timed[0],
    topAuthor: top(tally(read.map((x) => x.b.authors.slice(0, 1)))),
    topGenre: top(tally(read.map((x) => [...x.b.tags, ...x.b.subjects.slice(0, 2)].filter((t) => !/^fiction$/i.test(t))))),
    moods: [...moodMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    pace: top(paceMap)?.[0],
    busiestMonth: read.length ? [MONTH_NAMES[bm], perMonth[bm]] : undefined,
    perMonth,
    firstBook: read[0]?.b,
    lastBook: read[read.length - 1]?.b,
    added: books.filter((b) => b.owned !== false && b.addedAt.startsWith(year)).length,
    challenge: ch && cp ? { name: ch.name, done: Math.round(cp.done), goal: ch.goal, unit: ch.measure } : undefined,
    quote: quote ? { note: quote, book: byId.get(quote.bookId)! } : undefined,
    quotesSaved: yearQuotes.length,
    seriesFinished,
    covers: read.map((x) => x.b),
  };
}

export const shortTitle = (b: Book) => titleWithoutSeries(b.title);
