import type { Book, Reading } from '../types';
import { isMusic } from '../types';
import { currentReading, readingsOf } from './reading';
import { matchKey, sameWork } from './importHistory';
import { getJson } from './lookup';
import type { FeedEntry } from './feed';

/**
 * Recommendations: what to read next, worked out from the books you've read
 * and how you rated them. Books already on your shelves come first, then new
 * ones from Open Library, then what your friends loved.
 */

export interface Rec {
  /** Stays the same for the same book, so it can be hidden. */
  key: string;
  title: string;
  authors: string[];
  cover?: string;
  year?: number;
  pages?: number;
  /** Why it's here, e.g. "Because you loved Circe". */
  reason: string;
  /** A book already in Stacks (on your shelves). */
  bookId?: string;
  openLibraryKey?: string;
  /** A page about it elsewhere, e.g. the album on Deezer. */
  link?: string;
}

export interface Taste {
  authors: Map<string, number>;
  subjects: Map<string, number>;
  moods: Map<string, number>;
  /** Books you loved, best first. */
  loved: { b: Book; weight: number; rating?: number }[];
}

// Subjects that say nothing about what a book is like.
const NOISE =
  /^(fiction|general|novel|novels|literature|english|american|large type books|accessible book|protected daisy|in library|lending library|open library|overdrive|reading level|translations?( into .*)?|fiction in english|english fiction|american fiction|nyt:.*|new york times.*|award winners?|bestsellers?|readers?|textbooks?|juvenile works|long now manual for civilization|internet archive wishlist)$/;

/** "Fiction, fantasy, general" → ["fantasy"]. Lowercase, without noise. */
export function cleanSubjects(subjects: string[] = []): string[] {
  const out = new Set<string>();
  for (const s of subjects)
    for (const part of s.toLowerCase().split(/\s*(?:,|--|\/|;)\s*/)) {
      const p = part.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
      if (p.length < 3 || p.length > 40 || NOISE.test(p) || /\d{4}/.test(p)) continue;
      out.add(p);
    }
  return [...out];
}

export const authorKey = (a: string) => a.toLowerCase().replace(/[^a-z]/g, '');

/** How much a read counts: loved books a lot, books you put down against. */
function weightOf(r: Reading): number {
  if (r.status === 'dnf') return -1;
  if (r.status !== 'read') return 0;
  if (r.rating === undefined) return 1;
  if (r.rating >= 4.5) return 3;
  if (r.rating >= 4) return 2;
  if (r.rating >= 3) return 0.5;
  return -1;
}

export function tasteOf(books: Book[], readings: Reading[]): Taste {
  const authors = new Map<string, number>();
  const subjects = new Map<string, number>();
  const moods = new Map<string, number>();
  const loved: Taste['loved'] = [];
  const add = (m: Map<string, number>, k: string, w: number) => m.set(k, (m.get(k) ?? 0) + w);
  for (const b of books) {
    if (isMusic(b)) continue;
    const rs = readingsOf(readings, b.id).filter((r) => r.status === 'read' || r.status === 'dnf');
    if (!rs.length) continue;
    // The latest read decides; a book read twice counts a little more.
    const last = rs[rs.length - 1];
    const w = weightOf(last) * (rs.filter((r) => r.status === 'read').length > 1 ? 1.5 : 1);
    if (!w) continue;
    for (const a of b.authors.slice(0, 2)) add(authors, authorKey(a), w);
    for (const s of cleanSubjects(b.subjects).slice(0, 10)) add(subjects, s, w);
    for (const s of b.tags) add(subjects, s.toLowerCase(), w);
    for (const m of b.moods ?? []) add(moods, m, w);
    if (w >= 1) loved.push({ b, weight: w, rating: last.rating });
  }
  // Loved means 4 stars and up, or any finished book if you don't rate.
  if (loved.some((x) => x.weight >= 2)) loved.splice(0, loved.length, ...loved.filter((x) => x.weight >= 2));
  loved.sort((x, y) => y.weight - x.weight || (y.rating ?? 0) - (x.rating ?? 0));
  return { authors, subjects, moods, loved };
}

const stars = (n?: number) => (n ? ` (${n}★)` : '');

/** How well a book fits your taste, and the best reason for it. */
function fit(b: Pick<Book, 'title' | 'authors' | 'subjects' | 'tags' | 'moods'>, t: Taste): { score: number; reason?: string } {
  let score = 0;
  let reason: string | undefined;
  const aw = Math.max(0, ...b.authors.map((a) => t.authors.get(authorKey(a)) ?? 0));
  if (aw > 0) {
    score += aw * 3;
    const seed = t.loved.find((x) => x.b.authors.some((a) => b.authors.some((c) => authorKey(a) === authorKey(c))));
    reason = seed ? `By ${b.authors[0]}, who wrote ${seed.b.title}${stars(seed.rating)}` : `By ${b.authors[0]}, an author you like`;
  }
  const subs = [...cleanSubjects(b.subjects), ...b.tags.map((s) => s.toLowerCase())];
  let sw = 0;
  for (const s of subs) sw += Math.max(-1, t.subjects.get(s) ?? 0);
  score += sw / Math.sqrt(Math.max(4, subs.length));
  for (const m of b.moods ?? []) score += (t.moods.get(m) ?? 0) * 0.4;
  if (!reason && score > 0) {
    // The loved book it has most in common with.
    let best: { b: Book; n: number } | undefined;
    for (const x of t.loved.slice(0, 30)) {
      const theirs = new Set([...cleanSubjects(x.b.subjects), ...x.b.tags.map((s) => s.toLowerCase())]);
      const n = subs.filter((s) => theirs.has(s)).length + (x.b.moods ?? []).filter((m) => b.moods?.includes(m)).length * 0.5;
      if (n >= 2 && (!best || n > best.n)) best = { b: x.b, n };
    }
    if (best) reason = `Like ${best.b.title}`;
  }
  return { score, reason };
}

/** Unread books you already own, best fit first. */
export function fromShelves(books: Book[], readings: Reading[], t: Taste, hidden: Set<string>): Rec[] {
  const out: { rec: Rec; score: number; waited: number }[] = [];
  for (const b of books) {
    if (isMusic(b) || b.owned === false || hidden.has(recKey(b.title, b.authors[0]))) continue;
    const r = currentReading(readings, b.id);
    if (r && r.status !== 'want') continue;
    if (readingsOf(readings, b.id).some((x) => x.status === 'read' || x.status === 'dnf')) continue;
    // Not book 3 of a series while book 2 is still waiting.
    if (b.series?.number && books.some((o) => o.series?.name === b.series!.name && (o.series.number ?? 0) < b.series!.number! && !readingsOf(readings, o.id).some((x) => x.status === 'read')))
      continue;
    const f = fit(b, t);
    // Books that have waited longest get a small nudge.
    const waited = Math.min(1, (Date.now() - Date.parse(b.addedAt)) / (365 * 86_400_000));
    const queued = r?.status === 'want';
    out.push({
      waited: waited * 0.5,
      score: f.score + waited * 0.5,
      rec: {
        key: recKey(b.title, b.authors[0]),
        title: b.title,
        authors: b.authors,
        cover: b.coverUrl,
        pages: b.pageCount,
        bookId: b.id,
        reason: f.reason ?? shelfReason(queued, waited),
      },
    });
  }
  return out
    .filter((x) => !t.loved.length || x.score - x.waited > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.rec);
}

export const recKey = (title: string, author?: string) => matchKey(title, author);

/** You already have it, or read it, maybe as another edition with a different title. */
export function alreadyHave(books: Book[], title: string, author?: string): boolean {
  const k = recKey(title, author);
  return books.some((b) => !isMusic(b) && (recKey(b.title, b.authors[0]) === k || sameWork(b.title, b.authors[0], title, author)));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const FIELDS = 'key,title,author_name,cover_i,first_publish_year,number_of_pages_median,ratings_average,ratings_count,subject';
// Things Open Library lists as books that aren't one to read next.
const NOT_A_BOOK = /box(ed)? set|collection|omnibus|trilogy set|books? \d+\s*(-|–|&|and|to)\s*\d+|summary|study guide|sparknotes|cliffs ?notes|coloring|calendar|journal|workbook|companion|untitled|^the works of|selected works|complete works|\bsampler\b/i;

function docToRec(d: any, reason: string): Rec | undefined {
  if (!d?.title || NOT_A_BOOK.test(d.title)) return undefined;
  const authors: string[] = d.author_name ?? [];
  return {
    key: recKey(d.title, authors[0]),
    title: d.title,
    authors,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
    year: d.first_publish_year,
    pages: d.number_of_pages_median,
    openLibraryKey: d.key,
    reason,
  };
}

const lang = () => (navigator.language || 'en').slice(0, 2).toLowerCase();

async function search(q: string, extra = ''): Promise<any[]> {
  const data = (await getJson(
    `https://openlibrary.org/search.json?${q}&fields=${FIELDS}&lang=${lang()}&limit=30${extra}`,
  )) as { docs?: any[] };
  return data.docs ?? [];
}

export interface Shelf {
  id: string;
  title: string;
  recs: Rec[];
}

/** The book's best subjects for finding similar ones: what it shares with your taste. */
function seedSubjects(b: Book, t: Taste): string[] {
  return cleanSubjects(b.subjects)
    .map((s) => ({ s, w: t.subjects.get(s) ?? 0 }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w)
    .map((x) => x.s)
    // "greek mythology" already says "mythology".
    .reduce<string[]>((acc, s) => (acc.some((a) => a.includes(s) || s.includes(a)) ? acc : [...acc, s]), [])
    .slice(0, 2);
}

/**
 * New books from Open Library: more by the authors you rate highest, and
 * books like the ones you loved most. Skips what's already in Stacks.
 */
export async function fromOpenLibrary(books: Book[], t: Taste, hidden: Set<string>): Promise<Shelf[]> {
  const have = new Set(books.map((b) => recKey(b.title, b.authors[0])));
  const seen = new Set<string>();
  const keep = (r: Rec | undefined, d: any): r is Rec => {
    if (!r || have.has(r.key) || hidden.has(r.key) || seen.has(r.key) || alreadyHave(books, r.title, r.authors[0])) return false;
    // Very obscure listings are usually odd editions or not really books.
    if ((d.ratings_count ?? 0) < 3 && !d.cover_i) return false;
    seen.add(r.key);
    return true;
  };
  const score = (d: any) => (d.ratings_average ?? 3) * Math.log10(10 + (d.ratings_count ?? 0));
  const shelves: Shelf[] = [];

  // Your top authors. Their names as you wrote them, best first.
  const topAuthors: string[] = [];
  for (const x of t.loved) {
    const a = x.b.authors[0];
    if (a && !topAuthors.some((y) => authorKey(y) === authorKey(a))) topAuthors.push(a);
    if (topAuthors.length >= 3) break;
  }
  // Books like your favorites, by the subjects they share with your taste.
  const seeds = t.loved.filter((x) => seedSubjects(x.b, t).length).slice(0, 3);

  const [byAuthor, bySeed] = await Promise.all([
    Promise.allSettled(topAuthors.map((a) => search(`author=${encodeURIComponent(a)}`, '&sort=rating'))),
    Promise.allSettled(seeds.map((x) => search(`q=${encodeURIComponent(subjectQuery(seedSubjects(x.b, t)))}`, '&sort=rating'))),
  ]);
  if ([...byAuthor, ...bySeed].every((r) => r.status === 'rejected') && byAuthor.length + bySeed.length)
    throw new Error("Couldn't reach Open Library for new books. Check your connection and try again.");

  const authorRecs: Rec[] = [];
  byAuthor.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    const seed = t.loved.find((x) => authorKey(x.b.authors[0] ?? '') === authorKey(topAuthors[i]));
    const reason = seed ? `You ${seed.weight >= 2 ? 'loved' : 'read'} ${seed.b.title}${stars(seed.rating)}` : `More by ${topAuthors[i]}`;
    const docs = res.value
      .filter((d) => (d.author_name ?? []).some((n: string) => authorKey(n) === authorKey(topAuthors[i])))
      .sort((a, b) => score(b) - score(a));
    let n = 0;
    for (const d of docs) {
      const r = docToRec(d, reason);
      if (keep(r, d) && ++n <= 4) authorRecs.push(r);
      if (n >= 4) break;
    }
  });
  if (authorRecs.length) shelves.push({ id: 'authors', title: 'More from authors you love', recs: authorRecs });

  bySeed.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    const seed = seeds[i].b;
    const mine = new Set(seed.authors.map(authorKey));
    const docs = res.value
      .filter((d) => !(d.author_name ?? []).some((n: string) => mine.has(authorKey(n))))
      .sort((a, b) => score(b) - score(a));
    const recs: Rec[] = [];
    for (const d of docs) {
      const r = docToRec(d, `Also ${seedSubjects(seed, t).join(' and ')}`);
      if (keep(r, d)) recs.push(r);
      if (recs.length >= 6) break;
    }
    if (recs.length) shelves.push({ id: `seed:${seed.id}`, title: `Because you ${seeds[i].weight >= 2 ? 'loved' : 'read'} ${seed.title}`, recs });
  });
  return shelves;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Books your friends finished and rated 4 stars or more, that you don't have yet. */
export function fromFriends(feed: FeedEntry[], books: Book[], uid: string, hidden: Set<string>): Rec[] {
  const have = new Set(books.map((b) => recKey(b.title, b.authors[0])));
  const out = new Map<string, Rec & { n: number }>();
  for (const e of feed) {
    if (e.user_id === uid || !(e.kind === 'finished' || e.kind === 'rated') || (e.extra.rating ?? 0) < 4) continue;
    const it = e.items[0];
    if (it?.kind !== 'book') continue;
    const key = recKey(it.title, it.by);
    if (have.has(key) || hidden.has(key) || alreadyHave(books, it.title, it.by)) continue;
    const who = e.display_name || `@${e.username}`;
    const prev = out.get(key);
    if (prev) {
      if (!prev.reason.includes(who)) {
        prev.n++;
        prev.reason = prev.n === 2 ? `${prev.reason.split(' gave')[0]} and ${who} loved it` : `${prev.n} friends loved it`;
      }
      continue;
    }
    out.set(key, { key, n: 1, title: it.title, authors: it.by ? [it.by] : [], cover: it.cover, reason: `${who} gave it ${e.extra.rating}★` });
  }
  return [...out.values()].sort((a, b) => b.n - a.n).slice(0, 8).map(({ n: _n, ...r }) => r);
}

// Hidden recommendations and the last Open Library results stay on this device.
const HIDDEN = 'stacks.recs.hidden';
const CACHE = 'stacks.recs.cache';

export function hiddenRecs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function hideRec(key: string) {
  const s = hiddenRecs();
  s.add(key);
  try {
    localStorage.setItem(HIDDEN, JSON.stringify([...s].slice(-500)));
  } catch {
    /* full or blocked */
  }
}
export function unhideAll() {
  try {
    localStorage.removeItem(HIDDEN);
  } catch {
    /* blocked */
  }
}

/** A short fingerprint of your taste, so new ratings fetch fresh results. */
export const tasteId = (t: Taste) => t.loved.slice(0, 6).map((x) => `${x.b.id}:${x.weight}`).join(',');

export function cachedShelves(id: string, key = CACHE): Shelf[] | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(key) ?? 'null') as { id: string; at: number; shelves: Shelf[] } | null;
    if (c?.id === id && Date.now() - c.at < 3 * 86_400_000) return c.shelves;
  } catch {
    /* none */
  }
  return undefined;
}
export function cacheShelves(id: string, shelves: Shelf[], key = CACHE) {
  try {
    localStorage.setItem(key, JSON.stringify({ id, at: Date.now(), shelves }));
  } catch {
    /* full or blocked */
  }
}

function shelfReason(queued: boolean, waited: number): string {
  if (queued) return 'Already on your to-read list';
  return waited > 0.5 ? 'Has been on your shelf a while' : 'On your shelf, not read yet';
}

const subjectQuery = (subjects: string[]) => subjects.map((s) => `subject:"${s}"`).join(' AND ');
