// Core data model. Kept deliberately separate from future features:
// reading status, TBR shelves, sessions and reviews will live in their own
// stores keyed by `Book.id`, so the library never has to be migrated for them.

export const SCHEMA_VERSION = 7;

/** What sits on the shelf. Older saved items have no kind and are books. */
export type ItemKind = 'book' | 'vinyl' | 'cd';

export const KIND_LABELS: Record<ItemKind, { one: string; many: string }> = {
  book: { one: 'Book', many: 'Books' },
  vinyl: { one: 'Vinyl', many: 'Vinyl' },
  cd: { one: 'CD', many: 'CDs' },
};

export const kindOf = (b: { kind?: ItemKind }): ItemKind => b.kind ?? 'book';
export const isMusic = (b: { kind?: ItemKind }) => kindOf(b) !== 'book';

export type VinylSize = 12 | 10 | 7;

export type BookFormat =
  | 'hardcover'
  | 'paperback'
  | 'mass-market'
  | 'ebook'
  | 'audiobook'
  | 'other';

export const FORMAT_LABELS: Record<BookFormat, string> = {
  hardcover: 'Hardcover',
  paperback: 'Paperback',
  'mass-market': 'Mass market',
  ebook: 'Ebook',
  audiobook: 'Audiobook',
  other: 'Other',
};

export type MetadataSource = 'openlibrary' | 'googlebooks' | 'musicbrainz' | 'discogs' | 'deezer' | 'itunes' | 'goodreads' | 'storygraph' | 'manual';

/**
 * Facts about the edition, as returned by a lookup service. Music reuses the
 * same fields: authors are the artists, publisher is the record label.
 */
export interface BookMetadata {
  kind?: ItemKind;
  barcode?: string; // UPC/EAN on records and CDs (books use isbn13)
  isbn13?: string;
  isbn10?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  language?: string;
  description?: string;
  subjects: string[];
  coverUrl?: string;
  sources: MetadataSource[];
  openLibraryKey?: string;
  googleBooksId?: string;
  musicBrainzId?: string;
  discogsId?: number;
  trackCount?: number;
  discCount?: number;
  vinylSize?: VinylSize;
}

/** A book in the person's library: edition metadata plus ownership details. */
export interface Book extends BookMetadata {
  id: string;
  format: BookFormat;
  copies: number;
  acquiredOn?: string; // YYYY-MM-DD
  pricePaid?: number;
  currency?: string; // ISO code like 'EUR' for pricePaid
  location?: string; // free-text note, e.g. "Box in the attic"
  placement?: Placement; // a spot on one of the person's bookcases
  spineImage?: string; // the person's own photo of the spine, as a small JPEG data URL
  tags: string[];
  notes?: string;
  /** The record's tracks in order, with sides ("A1") or disc numbers ("1-03") as positions. */
  tracks?: Track[];
  /** Stacks has looked for a track list, so it won't look again by itself. */
  tracksChecked?: boolean;
  /** Vinyl color or look, e.g. "Red marble", "Clear", "Picture disc". */
  vinylColor?: string;
  /** Edition details, e.g. "Limited, 180 gram, Record Store Day". */
  edition?: string;
  /** Country the pressing was made for, e.g. "Netherlands". */
  pressingCountry?: string;
  /** Matrix / runout etching, e.g. "BSK-1-3010 A". */
  matrix?: string;
  /** Pressing details have been filled in from Discogs once. */
  pressingChecked?: boolean;
  /** Catalog number printed on the record, e.g. "MOVLP123". */
  catalogNumber?: string;
  /** Goldmine grades as Discogs writes them, e.g. "Near Mint (NM or M-)". */
  mediaCondition?: string;
  sleeveCondition?: string;
  /** What the record sells for on the Discogs marketplace, last time Stacks checked. */
  market?: { lowest?: number; suggested?: number; forSale?: number; currency: string; checkedAt: string };
  /** Your own idea of what it's worth, in the price-paid currency. Wins over Discogs. */
  myValue?: number;
  /** Stacks has looked up this Discogs release's details and cover. */
  discogsChecked?: boolean;
  loan?: { to: string; since: string }; // lent to a friend
  /** false for a book read but not owned (e.g. imported from Goodreads); it then stays off shelves and out of library counts. */
  owned?: boolean;
  /** A book you'd like to buy. Only for books you don't own. */
  wishlist?: boolean;
  /** How the book feels, e.g. ['dark', 'tense']. Names come from lib/moods. */
  moods?: string[];
  pace?: 'slow' | 'medium' | 'fast';
  contentWarnings?: string[];
  /** The series this book belongs to, e.g. { name: 'The Expanse', number: 1 }. */
  series?: BookSeries;
  /** Stacks has looked for a series for this book, so it won't look again. */
  seriesChecked?: boolean;
  /** Which version of the series finder last looked at this book. */
  seriesV?: number;
  /** You set the series yourself, so Stacks leaves it alone. */
  seriesManual?: boolean;
  /** True while mood, pace and warnings are Stacks' guess from the genres, until you change them. */
  vibeGuessed?: boolean;
  /** Stacks has tried guessing moods for this book, so it won't try again. */
  vibeChecked?: boolean;
  addedAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp, used for sync later
}

export interface BookSeries {
  name: string;
  number?: number; // can be 1.5 for a novella between books
}

export type ReadStatus = 'want' | 'reading' | 'read' | 'dnf';

export const STATUS_LABELS: Record<ReadStatus, string> = {
  want: 'Want to read',
  reading: 'Reading',
  read: 'Read',
  dnf: "Didn't finish",
};

/** One progress note while reading: where the person got to, and when. */
export interface ProgressUpdate {
  at: string; // ISO timestamp
  page?: number;
  percent?: number; // for books without a page count
}

/** One sitting with a book, from the reading timer or logged by hand. */
export interface ReadingSession {
  start: string; // ISO timestamp
  minutes: number;
  fromPage?: number;
  toPage?: number;
}

/**
 * One read-through of a book. Reading a book again starts a new one, so
 * every read keeps its own dates. Stored apart from the book itself.
 */
export interface Reading {
  id: string;
  bookId: string;
  status: ReadStatus;
  startedOn?: string; // YYYY-MM-DD
  finishedOn?: string; // YYYY-MM-DD, also the day a book was put down for 'dnf'
  updates: ProgressUpdate[];
  rating?: number; // 0.5 to 5, in half stars
  review?: string;
  /** Timed reading sessions. */
  sessions?: ReadingSession[];
  /** Place in the to-read queue (lower comes first). Unset means by date added. */
  queueOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export type ChallengeMeasure = 'books' | 'pages';

/** A reading goal, like "52 books in 2026" or "5,000 pages this summer". */
export interface Challenge {
  id: string;
  name: string;
  measure: ChallengeMeasure;
  goal: number;
  startOn: string; // YYYY-MM-DD
  endOn: string; // YYYY-MM-DD, inclusive
  /** Badge id -> the day it was earned. Earned badges are kept. */
  badges: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/** Where a book sits: bookcase, shelf (1 = top shelf, 0 = on top of the bookcase), section for cube units, and order. */
export interface Placement {
  bookcaseId: string;
  shelf: number;
  section: number; // 1 for ordinary bookcases; column for cube units like Kallax
  position: number; // 1 = leftmost
}

export type BookcaseType =
  | 'billy-80'
  | 'billy-40'
  | 'billy-80-low'
  | 'kallax-2x2'
  | 'kallax-2x4'
  | 'kallax-4x4'
  | 'wall-shelf'
  | 'custom';

export interface BookcasePreset {
  label: string;
  shelves: number;
  sections: number; // columns of cubes
  sectionWidthCm: number; // usable width of one shelf section
}

// Approximate inside measurements of common furniture.
export const BOOKCASE_PRESETS: Record<BookcaseType, BookcasePreset> = {
  'billy-80': { label: 'IKEA Billy, 80 cm wide, tall', shelves: 6, sections: 1, sectionWidthCm: 76 },
  'billy-40': { label: 'IKEA Billy, 40 cm wide, tall', shelves: 6, sections: 1, sectionWidthCm: 36 },
  'billy-80-low': { label: 'IKEA Billy, 80 cm wide, low', shelves: 3, sections: 1, sectionWidthCm: 76 },
  'kallax-2x2': { label: 'IKEA Kallax, 2×2 cubes', shelves: 2, sections: 2, sectionWidthCm: 33 },
  'kallax-2x4': { label: 'IKEA Kallax, 2×4 cubes', shelves: 4, sections: 2, sectionWidthCm: 33 },
  'kallax-4x4': { label: 'IKEA Kallax, 4×4 cubes', shelves: 4, sections: 4, sectionWidthCm: 33 },
  'wall-shelf': { label: 'Wall shelf, single', shelves: 1, sections: 1, sectionWidthCm: 80 },
  custom: { label: 'Custom size', shelves: 5, sections: 1, sectionWidthCm: 80 },
};

export interface Bookcase {
  id: string;
  name: string; // "Living room Billy"
  type: BookcaseType;
  shelves: number;
  sections: number;
  sectionWidthCm: number;
  color: 'white' | 'oak' | 'walnut' | 'black';
  order: number; // left-to-right in the Shelves view
  createdAt: string;
  updatedAt: string;
}

/** Rough spine thickness in cm, used to show how full a shelf is. */
export function spineCm(b: Pick<Book, 'pageCount' | 'format' | 'kind' | 'discCount'>): number {
  const discs = Math.max(1, b.discCount ?? 1);
  if (b.kind === 'vinyl') return 0.35 + discs * 0.2; // sleeve plus records
  if (b.kind === 'cd') return discs === 1 ? 1 : discs === 2 ? 2.2 : 1 + discs * 0.6; // jewel cases / box
  const pages = b.pageCount ?? 320;
  const paper = b.format === 'mass-market' ? 0.0055 : 0.0065;
  const boards = b.format === 'hardcover' ? 0.5 : 0.1;
  return Math.max(0.6, pages * paper + boards);
}

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'JPY', 'INR', 'ZAR', 'BRL', 'MXN'];

/** A sensible first guess from the browser's language and region. */
export function guessCurrency(): string {
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  const map: Record<string, string> = {
    US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
    PL: 'PLN', JP: 'JPY', IN: 'INR', ZA: 'ZAR', BR: 'BRL', MX: 'MXN',
  };
  const euro = ['BE', 'NL', 'DE', 'FR', 'ES', 'IT', 'PT', 'IE', 'AT', 'FI', 'LU', 'GR', 'SK', 'SI', 'EE', 'LV', 'LT', 'MT', 'CY', 'HR'];
  return map[region] ?? (euro.includes(region) ? 'EUR' : 'USD');
}

export function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return amount.toLocaleString(undefined, { style: 'currency', currency });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Standing height in cm. */
export function itemHeightCm(b: Pick<Book, 'kind' | 'format' | 'vinylSize'>): number {
  if (b.kind === 'vinyl') return b.vinylSize === 7 ? 18 : b.vinylSize === 10 ? 26 : 31.5;
  if (b.kind === 'cd') return 14.2;
  return b.format === 'mass-market' ? 17.5 : b.format === 'hardcover' ? 24 : 21.5;
}

/** A quote you saved from a book, or your own note about it. */
export interface BookNote {
  id: string;
  bookId: string;
  kind: 'quote' | 'note';
  text: string;
  page?: number;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One time you played a record or CD. */
export interface Spin {
  id: string;
  bookId: string;
  /** When you put it on (ISO). */
  at: string;
}

/** One song on a record or CD. */
export interface Track {
  /** "A1", "B3", "1-04", "7", or empty. */
  position?: string;
  title: string;
  /** "4:12" */
  duration?: string;
  /** Only when it differs from the record's artist (compilations). */
  artist?: string;
  favorite?: boolean;
}
