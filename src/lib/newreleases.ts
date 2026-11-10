import type { Book, Reading, Spin } from '../types';
import { isMusic } from '../types';
import { readingsOf } from './reading';
import { getGoogle, getJson, withGoogleKey } from './lookup';
import { authorKey, recKey, type Rec } from './recommend';
import { albumKey, artistKey, deezerAlbums, deezerArtist, musicTasteOf, NOT_NEW } from './musicrecs';
import { countOf } from './labels';
import { eachInTurn } from './inTurn';

/**
 * New releases: books just out or coming soon from the authors you read, and
 * new albums from the artists in your collection. Checked once a day.
 */

export interface Release extends Rec {
  kind: 'book' | 'music';
  /** "2026-11-04", or "2026-11" / "2026" when that's all that's known. */
  date: string;
  upcoming: boolean;
  /** For a book: its ISBN, so adding it fills in the details. */
  isbn13?: string;
  type?: string;
}

export interface Followed {
  name: string;
  /** How much you're into them; the top ones get checked. */
  weight: number;
  why: string;
}

const MONTH = 30 * 86_400_000;
/** How far back counts as "new", and how far ahead "coming soon" looks. */
const BACK = 12 * MONTH;
const AHEAD = 18 * MONTH;
const MAX_AUTHORS = 12;
const MAX_ARTISTS = 12;

const MUTED = 'stacks.releases.muted';
const CACHE = 'stacks.releases.cache';
const SEEN = 'stacks.releases.seen';

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, s: Set<string>, max = 800) {
  try {
    localStorage.setItem(key, JSON.stringify([...s].slice(-max)));
  } catch {
    /* full or blocked */
  }
}

/** Authors and artists you said to stop showing. Keys from authorKey/artistKey. */
export const mutedNames = () => readSet(MUTED);
export function muteName(key: string, on = true) {
  const s = readSet(MUTED);
  if (on) s.add(key);
  else s.delete(key);
  writeSet(MUTED, s);
}

/** Releases you've already seen, so Home can say how many are new. */
export const seenReleases = () => readSet(SEEN);
export function markSeen(keys: string[]) {
  const s = readSet(SEEN);
  keys.forEach((k) => s.add(k));
  writeSet(SEEN, s, 2000);
}

/** "2026-11-04" → ms, with "2026" meaning the middle of the year and "2026-11" the middle of the month. */
export function dateMs(d: string): number {
  if (/^\d{4}$/.test(d)) return Date.parse(`${d}-07-01`);
  if (/^\d{4}-\d{2}$/.test(d)) return Date.parse(`${d}-15`);
  return Date.parse(d.slice(0, 10));
}

export function dateLabel(d: string, now = Date.now()): string {
  const ms = dateMs(d);
  if (!Number.isFinite(ms)) return d;
  let opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', ...(new Date(ms).getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }) };
  if (/^\d{4}$/.test(d)) opts = { year: 'numeric' };
  else if (/^\d{4}-\d{2}$/.test(d)) opts = { month: 'long', year: 'numeric' };
  const s = new Date(ms).toLocaleDateString(undefined, opts);
  return ms > now ? `Out ${s}` : `Came out ${s}`;
}

/** The authors you read most and like best. Not authors you only put down. */
export function followedAuthors(books: Book[], readings: Reading[]): Followed[] {
  const muted = mutedNames();
  const by = new Map<string, { name: string; weight: number; read: number; loved: number; owned: number }>();
  for (const b of books) {
    if (isMusic(b) || !b.authors?.[0]) continue;
    const a = b.authors[0];
    const k = authorKey(a);
    if (!k || muted.has(k)) continue;
    const cur = by.get(k) ?? { name: a, weight: 0, read: 0, loved: 0, owned: 0 };
    const rs = readingsOf(readings, b.id);
    const last = rs[rs.length - 1];
    if (b.owned !== false && !b.wishlist) {
      cur.owned++;
      cur.weight += 0.5;
    }
    if (last?.status === 'read') {
      cur.read++;
      const r = last.rating;
      if (r === undefined) cur.weight += 1;
      else if (r >= 4) {
        cur.loved++;
        cur.weight += r >= 4.5 ? 3 : 2;
      } else if (r >= 3) cur.weight += 0.5;
      else cur.weight -= 1;
    } else if (last?.status === 'reading') cur.weight += 1;
    else if (last?.status === 'dnf') cur.weight -= 1.5;
    by.set(k, cur);
  }
  return [...by.values()]
    // One unread book on the shelf isn't following an author yet.
    .filter((a) => a.weight >= 1.5 || a.loved > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_AUTHORS)
    .map((a) => ({
      name: a.name,
      weight: a.weight,
      why: whyFollow(a),
    }));
}

const booksPhrase = (n: number) => (n === 1 ? 'a book' : `${n} books`);

function whyFollow(a: { name: string; loved: number; read: number; owned: number }): string {
  if (a.loved) return `You loved ${booksPhrase(a.loved)} by ${a.name}`;
  if (a.read) return `You've read ${booksPhrase(a.read)} by ${a.name}`;
  return `You have ${a.owned} books by ${a.name}`;
}

/** The artists you own and play most. */
export function followedArtists(records: Book[], spins: Spin[]): Followed[] {
  const muted = mutedNames();
  const t = musicTasteOf(records, spins);
  return [...t.artists.entries()]
    .filter(([k, a]) => !muted.has(k) && a.owned > 0)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, MAX_ARTISTS)
    .map(([, a]) => ({
      name: a.name,
      weight: a.weight,
      why: a.spins > 1 ? `You've spun ${a.name} ${a.spins} times` : `You have ${a.owned === 1 ? 'a record' : countOf(a.owned, 'record')} by ${a.name}`,
    }));
}

// Study guides, box sets and the like aren't a new book.
const NOT_A_NEW_BOOK_WORDS = [
  'summary', 'study guide', 'workbook', 'box set', 'boxed set', 'boxset', 'collection', 'sampler', 'coloring', 'colouring',
  'journal', 'calendar', 'omnibus', 'teacher', 'analysis of', 'conversation starters',
];
// "Books 1-3"
const BOOK_RANGE = /\bbooks? \d+ ?[-–&] ?\d/i;
const isNotANewBook = (title: string) => {
  const t = title.toLowerCase();
  return NOT_A_NEW_BOOK_WORDS.some((w) => t.includes(w)) || /\b(?:trilogy|sparknotes)\b/.test(t) || BOOK_RANGE.test(t);
};

const shortTitle = (t: string) => t.split(/[:(]/)[0].trim();

/* eslint-disable @typescript-eslint/no-explicit-any */
async function googleNewest(author: string): Promise<any[]> {
  const q = encodeURIComponent(`inauthor:"${author}"`);
  const url = withGoogleKey(`https://www.googleapis.com/books/v1/volumes?q=${q}&orderBy=newest&maxResults=20&printType=books`);
  const data = (await getGoogle(url)) as { items?: any[] };
  return data.items ?? [];
}

async function openLibraryNewest(author: string): Promise<any[]> {
  const data = (await getJson(
    `https://openlibrary.org/search.json?author=${encodeURIComponent(author)}&sort=new&fields=key,title,author_name,cover_i,first_publish_year,publish_date,isbn&limit=20`,
  )) as { docs?: any[] };
  return data.docs ?? [];
}

/** New and upcoming books by one author, newest first. */
async function booksBy(a: Followed, have: Set<string>, now: number): Promise<Release[]> {
  const ak = authorKey(a.name);
  const ok = (title: string, date: string | undefined) => {
    if (!title || !date || isNotANewBook(title)) return false;
    const ms = dateMs(date);
    return Number.isFinite(ms) && ms > now - BACK && ms < now + AHEAD && !have.has(recKey(shortTitle(title), a.name));
  };
  const out = new Map<string, Release>();
  let items: any[] | undefined;
  try {
    items = await googleNewest(a.name);
  } catch {
    items = undefined;
  }
  if (items) {
    for (const it of items) {
      const v = it.volumeInfo ?? {};
      if (!(v.authors ?? []).some((n: string) => authorKey(n) === ak)) continue;
      const title = shortTitle(v.title ?? '');
      if (!ok(title, v.publishedDate)) continue;
      const key = recKey(title, a.name);
      if (out.has(key)) continue;
      const isbn = (v.industryIdentifiers ?? []).find((x: any) => x.type === 'ISBN_13')?.identifier;
      out.set(key, {
        kind: 'book',
        key,
        title,
        authors: [a.name],
        cover: v.imageLinks?.thumbnail?.replace(/^http:/, 'https:').replace('&edge=curl', ''),
        pages: v.pageCount,
        year: Number(String(v.publishedDate).slice(0, 4)) || undefined,
        date: String(v.publishedDate).slice(0, 10),
        upcoming: dateMs(v.publishedDate) > now,
        isbn13: isbn,
        link: v.infoLink?.replace(/^http:/, 'https:'),
        reason: a.why,
      });
    }
  } else {
    // Google is busy or out of free lookups: Open Library knows recent books, though rarely upcoming ones.
    const docs = await openLibraryNewest(a.name);
    for (const d of docs) {
      if (!(d.author_name ?? []).some((n: string) => authorKey(n) === ak)) continue;
      const title = shortTitle(d.title ?? '');
      const date = d.first_publish_year ? String(d.first_publish_year) : undefined;
      if (!ok(title, date)) continue;
      const key = recKey(title, a.name);
      if (out.has(key)) continue;
      out.set(key, {
        kind: 'book',
        key,
        title,
        authors: [a.name],
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
        year: d.first_publish_year,
        date: date!,
        upcoming: false,
        openLibraryKey: d.key,
        isbn13: (d.isbn ?? []).find((x: string) => x.length === 13),
        reason: a.why,
      });
    }
  }
  return [...out.values()].slice(0, 4);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function albumsBy(a: Followed, records: Book[], now: number): Promise<Release[]> {
  const found = await deezerArtist(a.name);
  if (!found || artistKey(found.name) !== artistKey(a.name)) return [];
  const mine = records.filter((b) => artistKey(b.authors[0] ?? '') === artistKey(a.name)).map((b) => albumKey(b.title));
  const out: Release[] = [];
  const seen = new Set<string>();
  for (const x of await deezerAlbums(found.id)) {
    if (!x.date || (x.type !== 'album' && x.type !== 'ep') || NOT_NEW.test(x.title)) continue;
    const ms = dateMs(x.date);
    if (!(ms > now - BACK && ms < now + AHEAD)) continue;
    const ak = albumKey(x.title);
    if (seen.has(ak) || mine.some((m) => m === ak || (m.length > 3 && ak.startsWith(m)))) continue;
    seen.add(ak);
    out.push({
      kind: 'music',
      key: recKey(x.title, a.name),
      title: x.title,
      authors: [a.name],
      cover: x.cover,
      year: Number(x.date.slice(0, 4)) || undefined,
      date: x.date,
      upcoming: ms > now,
      link: x.link,
      type: x.type === 'ep' ? 'EP' : undefined,
      reason: a.why,
    });
  }
  return out.slice(0, 3);
}

/** A few at a time, so the services aren't flooded. */
async function inTurns<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  const chunks: T[][] = [];
  for (let i = 0; i < list.length; i += n) chunks.push(list.slice(i, i + n));
  await eachInTurn(chunks, async (chunk) => {
    out.push(...(await Promise.allSettled(chunk.map(fn))));
  });
  return out;
}

export interface ReleaseResult {
  books: Release[];
  music: Release[];
  /** Set when a whole side couldn't be checked. */
  bookError?: string;
  musicError?: string;
}

const newestFirst = (a: Release, b: Release) => dateMs(b.date) - dateMs(a.date);

export async function findReleases(allBooks: Book[], readings: Reading[], spins: Spin[], now = Date.now()): Promise<ReleaseResult> {
  // Ones on your wishlist still show, with their date.
  const owned = allBooks.filter((b) => b.owned !== false && !b.wishlist);
  const have = new Set(owned.map((b) => recKey(shortTitle(b.title ?? ''), b.authors?.[0])));
  const authors = followedAuthors(allBooks, readings);
  const records = allBooks.filter(isMusic);
  const artists = followedArtists(records, spins);
  const [b, m] = await Promise.all([inTurns(authors, 3, (a) => booksBy(a, have, now)), inTurns(artists, 3, (a) => albumsBy(a, records.filter((b) => b.owned !== false), now))]);
  const res: ReleaseResult = {
    books: b.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort(newestFirst),
    music: m.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort(newestFirst),
  };
  if (authors.length && b.every((r) => r.status === 'rejected')) res.bookError = "Couldn't reach Google Books or Open Library to look for new books.";
  if (artists.length && m.every((r) => r.status === 'rejected')) res.musicError = "Couldn't reach Deezer to look for new albums.";
  return res;
}

/** Who's being followed, so a new favorite author triggers a fresh check. */
export const followId = (allBooks: Book[], readings: Reading[], spins: Spin[]) =>
  [...followedAuthors(allBooks, readings).map((a) => a.name).sort((a, b) => a.localeCompare(b)), '|', ...followedArtists(allBooks.filter(isMusic), spins).map((a) => a.name).sort((a, b) => a.localeCompare(b))].join(',');

export function cachedReleases(id: string): (ReleaseResult & { at: number }) | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? 'null') as { id: string; at: number; res: ReleaseResult } | null;
    if (c?.id === id && Date.now() - c.at < 86_400_000) return { ...c.res, at: c.at };
  } catch {
    /* none */
  }
  return undefined;
}
export function cacheReleases(id: string, res: ReleaseResult) {
  try {
    localStorage.setItem(CACHE, JSON.stringify({ id, at: Date.now(), res: { books: res.books, music: res.music } }));
  } catch {
    /* full or blocked */
  }
}
