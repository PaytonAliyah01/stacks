import type { Book, BookSeries, Reading } from '../types';
import { currentReading } from './reading';

/** Bump when the series finder gets better, so books are looked at again. */
export const SERIES_FINDER_VERSION = 2;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

const num = (s?: string) => {
  if (!s) return undefined;
  const w = WORD_NUMBERS[s.toLowerCase()];
  if (w) return w;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : undefined;
};

// "#2", "no. 2", "vol. 2", "v. 2", "bk. 2", "book 2", "book two", "part 2", "[2]", "(2)"
const NUMBER = String.raw`(?:#|no\.?\s*|nr\.?\s*|vol(?:ume)?\.?\s*|v\.\s*|bk\.?\s*|book\s+|part\s+|tome\s+)?(\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
const TRAILING_NUMBER = new RegExp(String.raw`^(.*?)(?:\s*(?:[;,:]|--|-|–)\s*|\s+)[([]?${NUMBER}\s*[)\]]?\.?$`, 'i');

/** Takes publisher notes and the word "series" off a series name: "Harry Potter (Bloomsbury) series" → "Harry Potter". */
// "Book One of A Song of Ice and Fire", "Volume 2 of the Expanse", "#3 in Discworld"
// Needs the "book"/"volume" word, so "One of Us Is Lying" stays as it is.
const LEADING_NUMBER = new RegExp(String.raw`^\s*(?:#|no\.?\s*|vol(?:ume)?\.?\s*|bk\.?\s*|book\s+|part\s+|tome\s+)(\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:of|in)\s+(?:the\s+)?(?=\S)`, 'i');

export function cleanSeriesName(name: string): string {
  return name
    .replace(LEADING_NUMBER, (m) => (/\bthe\s+$/i.test(m) ? 'The ' : ''))
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(series|saga|sequence|novels?)\s*$/i, '')
    // A number left on the end ("The Empyrean 3.5") belongs to the book, not the series.
    .replace(/(\D)[\s,;:#-]*(?:#|book\s+|bk\.?\s*|vol\.?\s*)?\d+(?:[.,]\d+)?\s*$/i, '$1')
    .replace(/\b(series|saga|sequence|novels?)\s*$/i, '')
    .replace(/[\s,;:#.-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Dune Chronicles ; 1", "The Expanse, #3", "Discworld bk. 12", "Harry Potter (Bloomsbury) -- 3", "Harry Potter" */
export function parseSeries(raw: string): BookSeries | undefined {
  const s = raw.replace(/^series\s*:\s*/i, '').replace(/_/g, ' ').trim();
  if (!s || s.length > 90) return;
  const m = s.match(TRAILING_NUMBER);
  const lead = s.match(LEADING_NUMBER);
  const name = cleanSeriesName(m ? m[1] : s);
  if (!name || /^\d+$/.test(name) || name.length < 2) return;
  return { name, number: m ? num(m[2]) : lead ? num(lead[1]) : undefined };
}

/** Goodreads-style titles: "Leviathan Wakes (The Expanse, #1)", "(Mistborn Book 2)", "(Dune #1)". */
export function seriesFromTitle(title: string): BookSeries | undefined {
  const m = title.match(new RegExp(String.raw`\(([^()]+?),?\s*${NUMBER}\)\s*$`, 'i'));
  if (!m) return;
  const name = cleanSeriesName(m[1]);
  if (!name) return;
  return { name, number: num(m[2]) };
}

/** A title with a trailing "(Series, #n)" taken off, for display next to the series. */
export const titleWithoutSeries = (title: string) =>
  title.replace(new RegExp(String.raw`\s*\([^()]+?,?\s*${NUMBER}\)\s*$`, 'i'), '').trim() || title;

/** What counts as "the same series": "The Expanse", "Expanse series" and "The Expanse (Orbit)" all match. */
/** Series that go by more than one name. Keys on the left are folded into the right. */
const ALIASES: Record<string, string> = {
  'game of thrones': 'song of ice and fire',
  'song of ice fire': 'song of ice and fire',
  'chronicles of narnia': 'narnia',
  'lord of rings': 'lord of the rings',
  'hitchhiker s guide to galaxy': 'hitchhiker s guide to the galaxy',
};

export const seriesKey = (name: string) => {
  const k = baseKey(name);
  return ALIASES[k] ?? k;
};

const baseKey = (name: string) =>
  cleanSeriesName(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\b(trilogy|chronicles|cycle|universe|books|quartet|duology)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const seriesLabel = (s?: BookSeries) => (s ? `${s.name}${s.number !== undefined ? ` #${s.number}` : ''}` : '');

export interface SeriesEntry {
  book: Book;
  number?: number;
  status?: Reading['status'];
}

export interface SeriesGroup {
  name: string;
  /** Every name your books use for this series. */
  names: string[];
  entries: SeriesEntry[];
  /** Books in the series with no number yet. */
  unnumbered: SeriesEntry[];
  owned: number;
  read: number;
  /** Whole numbers between 1 and the highest you have, that you have no book for. */
  missing: number[];
  /** The first book in order you own and haven't read. */
  next?: Book;
  authors: string[];
}

// Names written like titles ("Dune Chronicles") read better than library entries ("Dune chronicles").
const titleCased = (n: string) => Number(n.split(' ').every((w) => w.length < 4 || /^[A-Z0-9]/.test(w)));

const authorKey = (a: string) => a.toLowerCase().replace(/[^a-z]+/g, '');

/** Every series with at least one book, biggest first. */
export function groupSeries(books: Book[], readings: Reading[]): SeriesGroup[] {
  // First by name, then join names that are clearly the same series from the same author
  // ("Dune" and "Dune Chronicles" by Frank Herbert).
  const groups: { keys: Set<string>; words: Set<string>; authors: Set<string>; books: Book[] }[] = [];
  for (const book of books) {
    if (!book.series?.name) continue;
    const k = seriesKey(book.series.name) || book.series.name.toLowerCase();
    let g = groups.find((x) => x.keys.has(k));
    if (!g) {
      g = { keys: new Set([k]), words: new Set(k.split(' ')), authors: new Set(), books: [] };
      groups.push(g);
    }
    g.books.push(book);
    for (const a of book.authors) g.authors.add(authorKey(a));
  }
  const subset = (a: Set<string>, b: Set<string>) => [...a].every((w) => b.has(w));
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      const sameAuthor = [...a.authors].some((x) => x && b.authors.has(x));
      // A series named after its first book ("A Game of Thrones") is the same as the one that book is in.
      const titleKeys = (x: typeof a) => new Set(x.books.map((bk) => baseKey(titleWithoutSeries(bk.title))));
      const namedAfterBook = [...a.keys].some((k) => titleKeys(b).has(k)) || [...b.keys].some((k) => titleKeys(a).has(k));
      if (sameAuthor && (subset(a.words, b.words) || subset(b.words, a.words) || namedAfterBook)) {
        b.keys.forEach((k) => a.keys.add(k));
        b.words.forEach((w) => a.words.add(w));
        b.authors.forEach((x) => a.authors.add(x));
        a.books.push(...b.books);
        groups.splice(j, 1);
        j = i;
      }
    }
  }

  return groups
    .map((g) => {
      const counts = new Map<string, number>();
      for (const b of g.books) {
        const n = cleanSeriesName(b.series!.name) || b.series!.name;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
      const names = [...counts.keys()];
      const name = [...counts.entries()].sort((a, b) => b[1] - a[1] || titleCased(b[0]) - titleCased(a[0]) || b[0].length - a[0].length)[0][0];
      const all = g.books.map((book) => ({
        book,
        // An older entry may carry its number in the name ("The Empyrean 3.5").
        number: book.series!.number ?? parseSeries(book.series!.name)?.number,
        status: currentReading(readings, book.id)?.status,
      }));
      const entries = all.filter((e) => e.number !== undefined).sort((a, b) => a.number! - b.number! || a.book.title.localeCompare(b.book.title));
      const unnumbered = all.filter((e) => e.number === undefined).sort((a, b) => a.book.title.localeCompare(b.book.title));
      const have = new Set(entries.map((e) => Math.floor(e.number!)));
      const top = Math.max(0, ...have);
      // A book without a number may be one of these; the Series page asks for its number.
      const missing = Array.from({ length: top }, (_, i) => i + 1).filter((n) => !have.has(n));
      const ordered = [...entries, ...unnumbered];
      const isRead = (e: SeriesEntry) => e.status === 'read';
      return {
        name,
        names,
        entries,
        unnumbered,
        owned: ordered.filter((e) => e.book.owned !== false).length,
        read: ordered.filter(isRead).length,
        missing,
        next: ordered.find((e) => !isRead(e) && e.status !== 'dnf' && e.book.owned !== false)?.book,
        authors: [...new Set(g.books.flatMap((b) => b.authors))],
      };
    })
    .sort((a, b) => b.entries.length + b.unnumbered.length - (a.entries.length + a.unnumbered.length) || a.name.localeCompare(b.name));
}

/** Publisher lines that libraries record as a "series" but aren't one ("Penguin Classics", "Vintage International"). */
export const isPublisherSeries = (name: string) =>
  /\b(classics?|library|collection|editions?|imprint|penguin|vintage|everyman|signet|bantam|orbit|tor|ace|del rey|harper|pan|picador|reader'?s?|book club|bestsellers?|large print|international|perennial|anchor|modern)\b/i.test(name);
