import { openDB, type IDBPDatabase } from 'idb';
import { SCHEMA_VERSION, type Book, type BookNote, type Bookcase, type Challenge, type Reading, type Spin } from '../types';

/**
 * Everything the app needs from storage. The browser (IndexedDB) version is
 * below; a cloud-synced version (e.g. Supabase) can implement the same
 * interface later without touching the screens.
 */
export interface LibraryStore {
  list(): Promise<Book[]>;
  get(id: string): Promise<Book | undefined>;
  findByIsbn(isbn13: string): Promise<Book | undefined>;
  findByBarcode(code: string): Promise<Book | undefined>;
  put(book: Book): Promise<void>;
  remove(id: string): Promise<void>;
  putMany(books: Book[]): Promise<void>;
  importMany(books: Book[], bookcases?: Bookcase[], readings?: Reading[], challenges?: Challenge[], notes?: BookNote[], spins?: Spin[]): Promise<number>;
  listBookcases(): Promise<Bookcase[]>;
  putBookcase(bookcase: Bookcase): Promise<void>;
  /** Deletes the bookcase and takes its books off it (they stay in the library). */
  removeBookcase(id: string): Promise<void>;
  listReadings(): Promise<Reading[]>;
  putReading(reading: Reading): Promise<void>;
  removeReading(id: string): Promise<void>;
  /** Every read-through of a book, e.g. when the book itself is deleted. */
  removeReadingsOf(bookId: string): Promise<void>;
  listChallenges(): Promise<Challenge[]>;
  putChallenge(c: Challenge): Promise<void>;
  removeChallenge(id: string): Promise<void>;
  listNotes(): Promise<BookNote[]>;
  putNote(n: BookNote): Promise<void>;
  removeNote(id: string): Promise<void>;
  removeNotesOf(bookId: string): Promise<void>;
  listSpins(): Promise<Spin[]>;
  putSpin(s: Spin): Promise<void>;
  removeSpin(id: string): Promise<void>;
  removeSpinsOf(bookId: string): Promise<void>;
}

export interface LibraryBackup {
  app: 'stacks';
  schemaVersion: number;
  exportedAt: string;
  books: Book[];
  bookcases?: Bookcase[];
  readings?: Reading[];
  challenges?: Challenge[];
  notes?: BookNote[];
  spins?: Spin[];
  /** Turntable styluses (kept in the browser's settings, not the database). */
  styluses?: unknown[];
}

const DB_NAME = 'stacks';

export class StorageError extends Error {}

/** The stores that sync to your account. */
export const SYNC_STORES = ['books', 'bookcases', 'readings', 'challenges', 'notes', 'spins'] as const;
export type SyncStore = (typeof SYNC_STORES)[number];

type ChangeListener = (store: SyncStore, ids: string[]) => void;
let changeListener: ChangeListener | undefined;
/** Told about every saved or deleted item, so sync knows what to send. */
export function onLocalChange(fn: ChangeListener | undefined) {
  changeListener = fn;
}
const changed = (store: SyncStore, ...ids: string[]) => ids.length && changeListener?.(store, ids);


class IndexedDbStore implements LibraryStore {
  private db: Promise<IDBPDatabase>;

  constructor() {
    // Started inside a promise so a browser with no storage at all fails here, not at startup.
    const opening: Promise<IDBPDatabase> = Promise.resolve().then(() => openDB(DB_NAME, SCHEMA_VERSION, {
      // An older Stacks tab must let go so this one can upgrade the library.
      blocking() {
        opening.then((db) => db.close());
      },
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const books = db.createObjectStore('books', { keyPath: 'id' });
          books.createIndex('isbn13', 'isbn13');
          books.createIndex('addedAt', 'addedAt');
        }
        if (oldVersion < 2) {
          db.createObjectStore('bookcases', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          transaction.objectStore('books').createIndex('barcode', 'barcode');
        }
        if (oldVersion < 4) {
          db.createObjectStore('readings', { keyPath: 'id' }).createIndex('bookId', 'bookId');
        }
        if (oldVersion < 5) {
          db.createObjectStore('challenges', { keyPath: 'id' });
        }
        if (oldVersion < 6) {
          db.createObjectStore('notes', { keyPath: 'id' }).createIndex('bookId', 'bookId');
        }
        if (oldVersion < 7) {
          db.createObjectStore('spins', { keyPath: 'id' }).createIndex('bookId', 'bookId');
        }
        // Future versions add stores here.
      },
    }));
    // If the browser never answers (storage blocked, or another Stacks tab won't
    // let go), fail with a reason instead of waiting forever.
    this.db = Promise.race([
      opening,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new StorageError(
                "Your browser didn't open the library storage. Close any other Stacks tabs and reload. In Brave, also try turning Shields off for this page.",
              ),
            ),
          6000,
        ),
      ),
    ]);
    opening.catch(() => undefined);
  }

  async list() {
    return (await this.db).getAll('books') as Promise<Book[]>;
  }
  async get(id: string) {
    return (await this.db).get('books', id) as Promise<Book | undefined>;
  }
  async findByIsbn(isbn13: string) {
    return (await this.db).getFromIndex('books', 'isbn13', isbn13) as Promise<Book | undefined>;
  }
  async findByBarcode(code: string) {
    const db = await this.db;
    const alt = code.length === 13 && code.startsWith('0') ? code.slice(1) : '0' + code;
    return ((await db.getFromIndex('books', 'barcode', code)) ?? (await db.getFromIndex('books', 'barcode', alt))) as
      | Book
      | undefined;
  }
  async put(book: Book) {
    await (await this.db).put('books', book);
    changed('books', book.id);
  }
  async remove(id: string) {
    await (await this.db).delete('books', id);
    changed('books', id);
  }
  async putMany(books: Book[]) {
    const tx = (await this.db).transaction('books', 'readwrite');
    for (const b of books) await tx.store.put(b);
    await tx.done;
    changed('books', ...books.map((b) => b.id));
  }
  async importMany(books: Book[], bookcases: Bookcase[] = [], readings: Reading[] = [], challenges: Challenge[] = [], notes: BookNote[] = [], spins: Spin[] = []) {
    const tx = (await this.db).transaction(['books', 'bookcases', 'readings', 'challenges', 'notes', 'spins'], 'readwrite');
    for (const x of spins) await tx.objectStore('spins').put(x);
    for (const n of notes) await tx.objectStore('notes').put(n);
    for (const c of challenges) await tx.objectStore('challenges').put(c);
    for (const b of books) await tx.objectStore('books').put(b);
    for (const c of bookcases) await tx.objectStore('bookcases').put(c);
    for (const r of readings) await tx.objectStore('readings').put(r);
    await tx.done;
    changed('spins', ...spins.map((x) => x.id));
    changed('notes', ...notes.map((x) => x.id));
    changed('challenges', ...challenges.map((x) => x.id));
    changed('books', ...books.map((x) => x.id));
    changed('bookcases', ...bookcases.map((x) => x.id));
    changed('readings', ...readings.map((x) => x.id));
    return books.length;
  }
  async listBookcases() {
    const all = (await (await this.db).getAll('bookcases')) as Bookcase[];
    return all.sort((a, b) => a.order - b.order);
  }
  async putBookcase(bookcase: Bookcase) {
    await (await this.db).put('bookcases', bookcase);
    changed('bookcases', bookcase.id);
  }
  async removeBookcase(id: string) {
    const tx = (await this.db).transaction(['books', 'bookcases'], 'readwrite');
    const books = tx.objectStore('books');
    const moved: string[] = [];
    for (const b of (await books.getAll()) as Book[]) {
      if (b.placement?.bookcaseId === id) {
        moved.push(b.id);
        const { placement: _gone, ...rest } = b;
        void _gone;
        await books.put({ ...rest, updatedAt: new Date().toISOString() });
      }
    }
    await tx.objectStore('bookcases').delete(id);
    await tx.done;
    changed('books', ...moved);
    changed('bookcases', id);
  }
  async listReadings() {
    return (await this.db).getAll('readings') as Promise<Reading[]>;
  }
  async putReading(reading: Reading) {
    await (await this.db).put('readings', reading);
    changed('readings', reading.id);
  }
  async removeReading(id: string) {
    await (await this.db).delete('readings', id);
    changed('readings', id);
  }
  async listChallenges() {
    return (await this.db).getAll('challenges') as Promise<Challenge[]>;
  }
  async putChallenge(c: Challenge) {
    await (await this.db).put('challenges', c);
    changed('challenges', c.id);
  }
  async removeChallenge(id: string) {
    await (await this.db).delete('challenges', id);
    changed('challenges', id);
  }
  async listNotes() {
    return (await this.db).getAll('notes') as Promise<BookNote[]>;
  }
  async putNote(n: BookNote) {
    await (await this.db).put('notes', n);
    changed('notes', n.id);
  }
  async removeNote(id: string) {
    await (await this.db).delete('notes', id);
    changed('notes', id);
  }
  async removeNotesOf(bookId: string) {
    const tx = (await this.db).transaction('notes', 'readwrite');
    const keys = await tx.store.index('bookId').getAllKeys(bookId);
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
    changed('notes', ...keys.map(String));
  }
  async listSpins() {
    return (await this.db).getAll('spins') as Promise<Spin[]>;
  }
  async putSpin(x: Spin) {
    await (await this.db).put('spins', x);
    changed('spins', x.id);
  }
  async removeSpin(id: string) {
    await (await this.db).delete('spins', id);
    changed('spins', id);
  }
  async removeSpinsOf(bookId: string) {
    const tx = (await this.db).transaction('spins', 'readwrite');
    const keys = await tx.store.index('bookId').getAllKeys(bookId);
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
    changed('spins', ...keys.map(String));
  }
  async removeReadingsOf(bookId: string) {
    const tx = (await this.db).transaction('readings', 'readwrite');
    const keys = await tx.store.index('bookId').getAllKeys(bookId);
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
    changed('readings', ...keys.map(String));
  }

  /** For sync: read, write and delete any item without telling the sync about it. */
  async rawAll(name: SyncStore) {
    return (await this.db).getAll(name) as Promise<{ id: string }[]>;
  }
  async rawGet(name: SyncStore, id: string) {
    return (await this.db).get(name, id) as Promise<{ id: string } | undefined>;
  }
  async rawApply(name: SyncStore, puts: { id: string }[], deletes: string[]) {
    const tx = (await this.db).transaction(name, 'readwrite');
    for (const x of puts) await tx.store.put(x);
    for (const id of deletes) await tx.store.delete(id);
    await tx.done;
  }
  /** Empties every store, e.g. when someone signs out of a shared phone. */
  async rawClearAll() {
    const tx = (await this.db).transaction([...SYNC_STORES], 'readwrite');
    for (const n of SYNC_STORES) await tx.objectStore(n).clear();
    await tx.done;
  }
}

const idb = new IndexedDbStore();
export const store: LibraryStore = idb;
export const rawStore = idb;

export function newId(): string {
  return crypto.randomUUID();
}

export function makeBackup(books: Book[], bookcases: Bookcase[], readings: Reading[] = [], challenges: Challenge[] = [], notes: BookNote[] = [], spins: Spin[] = [], styluses: unknown[] = []): LibraryBackup {
  return { app: 'stacks', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), books, bookcases, readings, challenges, notes, spins, styluses };
}

export function parseBackup(text: string): { books: Book[]; bookcases: Bookcase[]; readings: Reading[]; challenges: Challenge[]; notes: BookNote[]; spins: Spin[]; styluses: unknown[] } {
  const data = JSON.parse(text) as Partial<LibraryBackup>;
  if (data.app !== 'stacks' || !Array.isArray(data.books)) {
    throw new Error("That file isn't a Stacks backup.");
  }
  return {
    books: data.books.filter((b) => b && typeof b.id === 'string' && typeof b.title === 'string'),
    bookcases: (data.bookcases ?? []).filter((c) => c && typeof c.id === 'string'),
    readings: (data.readings ?? []).filter((r) => r && typeof r.id === 'string' && typeof r.bookId === 'string'),
    challenges: (data.challenges ?? []).filter((c) => c && typeof c.id === 'string' && typeof c.goal === 'number'),
    notes: (data.notes ?? []).filter((n) => n && typeof n.id === 'string' && typeof n.bookId === 'string' && typeof n.text === 'string'),
    spins: (data.spins ?? []).filter((x) => x && typeof x.id === 'string' && typeof x.bookId === 'string' && typeof x.at === 'string'),
    styluses: Array.isArray(data.styluses) ? data.styluses : [],
  };
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(books: Book[], placeLabel: (b: Book) => string = () => ''): string {
  const cols: [string, (b: Book) => unknown][] = [
    ['Title', (b) => b.title],
    ['Subtitle', (b) => b.subtitle],
    ['Authors / artists', (b) => b.authors.join('; ')],
    ['Type', (b) => b.kind ?? 'book'],
    ['ISBN13', (b) => b.isbn13],
    ['Barcode', (b) => b.barcode],
    ['ISBN10', (b) => b.isbn10],
    ['Publisher / label', (b) => b.publisher],
    ['Published', (b) => b.publishedDate],
    ['Pages', (b) => b.pageCount],
    ['Format', (b) => b.format],
    ['Copies', (b) => b.copies],
    ['Acquired', (b) => b.acquiredOn],
    ['Price paid', (b) => b.pricePaid],
    ['Currency', (b) => (b.pricePaid !== undefined ? b.currency : '')],
    ['Bookcase spot', placeLabel],
    ['Location note', (b) => b.location],
    ['Tags', (b) => b.tags.join('; ')],
    ['Notes', (b) => b.notes],
    ['Added', (b) => b.addedAt],
  ];
  const lines = [cols.map((c) => c[0]).join(',')];
  for (const b of books) lines.push(cols.map(([, f]) => csvCell(f(b))).join(','));
  return lines.join('\n');
}

export function downloadFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
