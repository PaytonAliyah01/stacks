import type { Book, BookFormat, BookNote, ReadStatus, Reading } from '../types';
import { isMusic } from '../types';
import { isValidIsbn10, isValidIsbn13, isbn10to13, isbn13to10 } from './isbn';
import { newId } from './storage';
import { parseMoods, parsePace, parseWarnings, type Mood, type Pace } from './moods';

export type ImportSource = 'goodreads' | 'storygraph';

/** One book from another app's export, in a common shape. */
export interface ImportRow {
  title: string;
  authors: string[];
  isbn13?: string;
  isbn10?: string;
  pageCount?: number;
  publisher?: string;
  publishedDate?: string;
  format?: BookFormat;
  status: ReadStatus;
  reads: { startedOn?: string; finishedOn?: string }[];
  rating?: number;
  review?: string;
  tags: string[];
  owned: boolean;
  addedOn?: string;
  moods?: Mood[];
  pace?: Pace;
  privateNotes?: string;
  contentWarnings?: string[];
}

/** A small CSV reader: quoted fields, doubled quotes and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** "2023/01/05", "2023-01-05" or "2023/1/5" to "2023-01-05". */
function day(v?: string): string | undefined {
  const m = v?.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : undefined;
}

function isbns(raw13?: string, raw10?: string): { isbn13?: string; isbn10?: string } {
  // Goodreads writes ISBNs as ="9780441172719" so spreadsheets keep the zeros.
  const c13 = (raw13 ?? '').replace(/[^0-9X]/gi, '').toUpperCase();
  const c10 = (raw10 ?? '').replace(/[^0-9X]/gi, '').toUpperCase();
  if (isValidIsbn13(c13)) return { isbn13: c13, isbn10: isbn13to10(c13) };
  if (isValidIsbn10(c10)) return { isbn13: isbn10to13(c10), isbn10: c10 };
  if (isValidIsbn10(c13)) return { isbn13: isbn10to13(c13), isbn10: c13 };
  return {};
}

function formatOf(v?: string): BookFormat | undefined {
  const s = (v ?? '').toLowerCase();
  if (!s) return undefined;
  if (s.includes('mass')) return 'mass-market';
  if (s.includes('hard')) return 'hardcover';
  if (s.includes('paper')) return 'paperback';
  if (s.includes('audio')) return 'audiobook';
  if (s.includes('kindle') || s.includes('ebook') || s.includes('digital') || s.includes('nook')) return 'ebook';
  return 'other';
}

const SHELF_STATUS: Record<string, ReadStatus> = {
  read: 'read',
  'currently-reading': 'reading',
  'to-read': 'want',
  'did-not-finish': 'dnf',
  dnf: 'dnf',
  abandoned: 'dnf',
};

function fromGoodreads(get: (row: string[], col: string) => string, rows: string[][]): ImportRow[] {
  return rows.map((r) => {
    const shelf = get(r, 'Exclusive Shelf').trim().toLowerCase();
    const status = SHELF_STATUS[shelf] ?? 'want';
    const finished = day(get(r, 'Date Read'));
    const authors = [get(r, 'Author'), ...get(r, 'Additional Authors').split(',')].map((a) => a.trim()).filter(Boolean);
    const rating = Number(get(r, 'My Rating')) || undefined;
    const year = get(r, 'Original Publication Year') || get(r, 'Year Published');
    return {
      title: get(r, 'Title').trim(),
      authors,
      ...isbns(get(r, 'ISBN13'), get(r, 'ISBN')),
      pageCount: Number(get(r, 'Number of Pages')) || undefined,
      publisher: get(r, 'Publisher') || undefined,
      publishedDate: year || undefined,
      format: formatOf(get(r, 'Binding')),
      status,
      reads: status === 'read' || status === 'dnf' ? [{ finishedOn: finished }] : status === 'reading' ? [{}] : [],
      rating,
      review: get(r, 'My Review').replace(/<br\s*\/?>/gi, '\n').trim() || undefined,
      tags: get(r, 'Bookshelves')
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t && !(t in SHELF_STATUS)),
      owned: Number(get(r, 'Owned Copies')) > 0,
      addedOn: day(get(r, 'Date Added')),
      privateNotes: get(r, 'Private Notes').replace(/<br\s*\/?>/gi, '\n').trim() || undefined,
    };
  });
}

function fromStoryGraph(get: (row: string[], col: string) => string, rows: string[][]): ImportRow[] {
  return rows.map((r) => {
    const status = SHELF_STATUS[get(r, 'Read Status').trim().toLowerCase()] ?? 'want';
    // "2023/01/05-2023/01/20, 2024/03/01-2024/03/09"; a single date means only the finish is known.
    const ranges: { startedOn?: string; finishedOn?: string }[] = get(r, 'Dates Read')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const [a, b] = x.split('-').map((y) => y.trim());
        return b ? { startedOn: day(a), finishedOn: day(b) } : { finishedOn: day(a) };
      });
    const last = day(get(r, 'Last Date Read'));
    let reads = ranges;
    if (!reads.length && (status === 'read' || status === 'dnf')) reads = [{ finishedOn: last }];
    if (status === 'reading') reads = [...reads, {}];
    return {
      title: get(r, 'Title').trim(),
      authors: get(r, 'Authors').split(',').map((a) => a.trim()).filter(Boolean),
      ...isbns(get(r, 'ISBN/UID'), get(r, 'ISBN/UID')),
      format: formatOf(get(r, 'Format')),
      status,
      reads,
      rating: Number(get(r, 'Star Rating')) || undefined,
      review: get(r, 'Review').trim() || undefined,
      tags: get(r, 'Tags').split(',').map((t) => t.trim()).filter(Boolean),
      owned: /^yes$/i.test(get(r, 'Owned?').trim()),
      addedOn: day(get(r, 'Date Added')),
      moods: parseMoods(get(r, 'Moods')),
      pace: parsePace(get(r, 'Pace')),
      contentWarnings: parseWarnings(get(r, 'Content Warnings')),
    };
  });
}

/** Reads a Goodreads or StoryGraph export. */
export function parseHistory(text: string): { source: ImportSource; rows: ImportRow[] } {
  const all = parseCsv(text);
  const head = (all[0] ?? []).map((h) => h.trim());
  const col = new Map(head.map((h, i) => [h, i]));
  const get = (row: string[], name: string) => (col.has(name) ? row[col.get(name)!] ?? '' : '');
  const body = all.slice(1);
  let rows: ImportRow[];
  let source: ImportSource;
  if (col.has('Exclusive Shelf') && col.has('Title')) {
    source = 'goodreads';
    rows = fromGoodreads(get, body);
  } else if (col.has('Read Status') && col.has('Title')) {
    source = 'storygraph';
    rows = fromStoryGraph(get, body);
  } else {
    throw new Error("That file doesn't look like a Goodreads or StoryGraph export. Use the .csv file they email or download for you.");
  }
  return { source, rows: rows.filter((r) => r.title) };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .split(':')[0]
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export const matchKey = (title: string, author?: string) => `${norm(title)}|${norm(author ?? '').split(' ').pop() ?? ''}`;

const plain = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(the|a|an) /, '');
/** The whole title, and the part after a colon ("Percy Jackson and the Olympians: The Lightning Thief"). */
const titleForms = (t: string) => {
  const parts = t.split(':');
  return [plain(t), parts.length > 1 ? plain(parts.slice(1).join(' ')) : ''].filter((x) => x.length >= 6);
};
/**
 * The same book under a different edition's title, by the same author:
 * "Percy Jackson and the Lightning Thief" and "The Lightning Thief (Percy Jackson and the Olympians, #1)".
 */
export function sameWork(aTitle: string, aAuthor: string | undefined, bTitle: string, bAuthor: string | undefined): boolean {
  const last = (a?: string) => norm(a ?? '').split(' ').pop() ?? '';
  if (!last(aAuthor) || last(aAuthor) !== last(bAuthor)) return false;
  for (const x of titleForms(aTitle))
    for (const y of titleForms(bTitle)) {
      if (x === y) return true;
      const [short, long] = x.length < y.length ? [x, y] : [y, x];
      if (` ${long} `.includes(` ${short} `)) return true;
    }
  return false;
}

export interface ImportPlan {
  newBooks: Book[];
  /** Existing books that get marked as owned. */
  updatedBooks: Book[];
  readings: Reading[];
  /** Goodreads private notes, saved as notes on the book. */
  notes: BookNote[];
  matched: number;
  skippedReads: number;
  /** "Want to read" entries for books the import says you've read or started: they'd hide that read. */
  removedReadings: string[];
  /** Copies an earlier import added that are really a book you own under another edition's title. */
  merges: { from: string; into: string }[];
}

/**
 * Works out what to add: new books for titles you don't have yet, read-throughs
 * for every book (skipping ones already logged with the same finish date).
 */
export function planImport(rows: ImportRow[], source: ImportSource, existing: Book[], existingReadings: Reading[], defaultFormat: BookFormat, existingNotes: BookNote[] = []): ImportPlan {
  const byIsbn = new Map(existing.filter((b) => b.isbn13).map((b) => [b.isbn13!, b]));
  const byTitle = new Map(existing.map((b) => [matchKey(b.title, b.authors[0]), b]));
  const plan: ImportPlan = { newBooks: [], updatedBooks: [], readings: [], notes: [], matched: 0, skippedReads: 0, removedReadings: [], merges: [] };
  const now = new Date().toISOString();

  for (const row of rows) {
    let book = (row.isbn13 && byIsbn.get(row.isbn13)) || byTitle.get(matchKey(row.title, row.authors[0]));
    // A copy you own under another edition's title counts as the same book.
    const owned = (b?: Book) => !!b && b.owned !== false && !b.wishlist && !isMusic(b);
    if (!owned(book)) {
      const twin = existing.find((b) => owned(b) && b.id !== book?.id && sameWork(b.title, b.authors[0], row.title, row.authors[0]));
      if (twin) {
        // An earlier import made a separate, not-owned copy: fold it into yours.
        if (book?.owned === false && !plan.merges.some((m) => m.from === book!.id)) plan.merges.push({ from: book.id, into: twin.id });
        book = twin;
      }
    }
    if (book) {
      plan.matched++;
      // Fill in what we learn, without overwriting anything you set yourself.
      const patch: Partial<Book> = {};
      if (row.owned && book.owned === false) patch.owned = undefined;
      if (row.moods?.length && !book.moods?.length) patch.moods = row.moods;
      if (row.pace && !book.pace) patch.pace = row.pace;
      if (row.contentWarnings?.length && !book.contentWarnings?.length) patch.contentWarnings = row.contentWarnings;
      if (Object.keys(patch).length) {
        book = { ...book, ...patch, updatedAt: now };
        const at = plan.updatedBooks.findIndex((b) => b.id === book!.id);
        if (at >= 0) plan.updatedBooks[at] = book;
        else plan.updatedBooks.push(book);
      }
    } else {
      book = {
        id: newId(),
        kind: 'book',
        title: row.title,
        authors: row.authors,
        isbn13: row.isbn13,
        isbn10: row.isbn10,
        pageCount: row.pageCount,
        publisher: row.publisher,
        publishedDate: row.publishedDate,
        subjects: [],
        coverUrl: row.isbn13 ? `https://covers.openlibrary.org/b/isbn/${row.isbn13}-M.jpg?default=false` : undefined,
        sources: [source],
        format: row.format ?? defaultFormat,
        copies: 1,
        tags: row.tags,
        owned: row.owned ? undefined : false,
        moods: row.moods?.length ? row.moods : undefined,
        pace: row.pace,
        contentWarnings: row.contentWarnings?.length ? row.contentWarnings : undefined,
        addedAt: row.addedOn ? `${row.addedOn}T12:00:00.000Z` : now,
        updatedAt: now,
      };
      plan.newBooks.push(book);
      if (book.isbn13) byIsbn.set(book.isbn13, book);
      byTitle.set(matchKey(book.title, book.authors[0]), book);
    }

    if (row.privateNotes && !existingNotes.some((n) => n.bookId === book!.id && n.text === row.privateNotes)) {
      plan.notes.push({ id: newId(), bookId: book.id, kind: 'note', text: row.privateNotes, createdAt: now, updatedAt: now });
    }

    const merged = new Set(plan.merges.filter((m) => m.into === book!.id).map((m) => m.from));
    const logged = existingReadings.filter((r) => r.bookId === book!.id || merged.has(r.bookId));
    // You marked it "Want to read" in Stacks, but Goodreads or StoryGraph says you read it (or are reading it):
    // drop the want, or it stays the book's current status and the read never shows.
    if (row.status !== 'want')
      for (const r of logged)
        if (r.status === 'want' && !r.updates?.length && !r.sessions?.length && !plan.removedReadings.includes(r.id)) plan.removedReadings.push(r.id);
    // Oldest first, open reads last, so the newest read gets the current status, rating and review.
    const reads = row.status === 'want' ? [{}] : [...row.reads].sort((a, b) => (a.finishedOn ?? '9999').localeCompare(b.finishedOn ?? '9999'));
    reads.forEach((read: { startedOn?: string; finishedOn?: string }, i) => {
      const isLast = i === reads.length - 1;
      const status: ReadStatus = isLast ? row.status : 'read';
      // Already there? Same status and finish date (or the same open status).
      if (logged.some((r) => r.status === status && (r.finishedOn ?? '') === (read.finishedOn ?? ''))) {
        plan.skippedReads++;
        return;
      }
      const created = read.startedOn ?? read.finishedOn ?? row.addedOn;
      plan.readings.push({
        id: newId(),
        bookId: book!.id,
        status,
        startedOn: read.startedOn,
        finishedOn: status === 'read' || status === 'dnf' ? read.finishedOn : undefined,
        updates: [],
        rating: isLast ? row.rating : undefined,
        review: isLast ? row.review : undefined,
        // Keep the order of re-reads right, so the latest one decides the status.
        createdAt: created ? `${created}T12:00:00.${String(i).padStart(3, '0')}Z` : now,
        updatedAt: now,
      });
    });
  }
  return plan;
}
