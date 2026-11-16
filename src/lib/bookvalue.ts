import type { Book } from '../types';
import { isMusic } from '../types';

/**
 * What your books are worth. No free service gives real second-hand book
 * prices, so a book is valued at your own estimate when you set one, and
 * otherwise at a typical second-hand price for its format and age. Records
 * and CDs use Discogs (see value.ts).
 */
export interface BookValue {
  amount: number;
  currency: string;
  source: 'yours' | 'typical';
}

/** Typical second-hand prices in euros, by format. Ebooks can't be resold. */
const BASE_EUR: Record<string, number> = {
  'mass-market': 2,
  paperback: 4,
  hardcover: 7,
  audiobook: 5,
  other: 4,
};

/** Rough euro rates, only to scale the typical prices. */
const PER_EUR: Record<string, number> = { EUR: 1, USD: 1.1, GBP: 0.85, CAD: 1.5, AUD: 1.65, NZD: 1.8, CHF: 0.95, SEK: 11.5, NOK: 11.7, DKK: 7.45, PLN: 4.3 };
export const canEstimate = (currency: string) => currency in PER_EUR;
/** The plain typical price for a format, for explaining the numbers. */
export const typicalFor = (format: string, currency: string) => (canEstimate(currency) && BASE_EUR[format] ? Math.round(BASE_EUR[format] * PER_EUR[currency]) : undefined);

const yearOf = (b: Book) => {
  const y = Number.parseInt(b.publishedDate?.slice(0, 4) ?? '', 10);
  return Number.isFinite(y) && y > 1400 ? y : undefined;
};

/** A typical second-hand price for one copy, rounded to a whole amount. */
export function typicalPrice(b: Book, currency: string, now = new Date()): number | undefined {
  const base = BASE_EUR[b.format];
  if (base === undefined || !canEstimate(currency)) return undefined;
  let v = base;
  const year = yearOf(b);
  const age = year === undefined ? undefined : now.getFullYear() - year;
  if (age !== undefined && age <= 2) v *= 1.6; // recent books still sell close to new
  else if (age !== undefined && age >= 50 && b.format === 'hardcover') v *= 1.5; // old hardcovers
  if ((b.pageCount ?? 0) > 600) v *= 1.2;
  return Math.max(1, Math.round(v * PER_EUR[currency]));
}

export function bookValue(b: Book, currency: string): BookValue | undefined {
  if (b.myValue !== undefined) return { amount: b.myValue, currency: b.currency ?? currency, source: 'yours' };
  const t = typicalPrice(b, currency);
  return t === undefined ? undefined : { amount: t, currency, source: 'typical' };
}

/** Books that may sell for much more than a typical copy, worth looking up. */
export function worthChecking(b: Book, now = new Date()): string | undefined {
  if (b.myValue !== undefined || b.format === 'ebook' || b.format === 'audiobook') return undefined;
  const year = yearOf(b);
  const age = year === undefined ? undefined : now.getFullYear() - year;
  if (age !== undefined && age >= 40 && b.format === 'hardcover') return `${year} hardcover: an early printing can be worth much more`;
  if (age !== undefined && age >= 60) return `From ${year}: an early printing can be worth much more`;
  if (/\b(signed|first edition|1st edition|limited|special edition|collector'?s)\b/i.test(`${b.title} ${b.subtitle ?? ''} ${b.edition ?? ''} ${b.tags.join(' ')}`)) return 'Special edition';
  return undefined;
}

const q = (b: Book) => encodeURIComponent(b.isbn13 ?? `${b.title} ${b.authors[0] ?? ''}`.trim());
/** Places to look up what copies really sell for. */
export const priceLinks = (b: Book) => [
  { label: 'BookFinder', url: b.isbn13 ? `https://www.bookfinder.com/search/?isbn=${b.isbn13}` : `https://www.bookfinder.com/search/?keywords=${q(b)}` },
  { label: 'AbeBooks', url: b.isbn13 ? `https://www.abebooks.com/servlet/SearchResults?isbn=${b.isbn13}` : `https://www.abebooks.com/servlet/SearchResults?kn=${q(b)}` },
  { label: 'eBay sold', url: `https://www.ebay.com/sch/i.html?_nkw=${q(b)}&LH_Sold=1&LH_Complete=1` },
];

export interface BookValueSummary {
  currency: string;
  total: number;
  yours: number;
  typical: number;
  copies: number;
  valued: number;
  /** Values set in another currency, left out of the total. */
  otherCurrency: number;
  paid: number;
  top: { b: Book; v: BookValue }[];
  check: { b: Book; why: string }[];
}

/** Owned books only: wishlist books and records are left out. */
export function summarizeBooks(all: Book[], currency: string): BookValueSummary {
  const s: BookValueSummary = { currency, total: 0, yours: 0, typical: 0, copies: 0, valued: 0, otherCurrency: 0, paid: 0, top: [], check: [] };
  for (const b of all) {
    if (isMusic(b) || b.owned === false) continue;
    const copies = Math.max(1, b.copies);
    s.copies += copies;
    if (b.pricePaid !== undefined && (b.currency ?? currency) === currency) s.paid += b.pricePaid * copies;
    const why = worthChecking(b);
    if (why) s.check.push({ b, why });
    const v = bookValue(b, currency);
    if (!v) continue;
    if (v.currency !== currency) {
      s.otherCurrency++;
      continue;
    }
    s.total += v.amount * copies;
    s.valued += copies;
    if (v.source === 'yours') s.yours += copies;
    else s.typical += copies;
    s.top.push({ b, v });
  }
  s.top.sort((a, b) => b.v.amount - a.v.amount || (a.v.source === 'yours' ? -1 : 1));
  s.check.sort((a, b) => (a.b.publishedDate ?? '').localeCompare(b.b.publishedDate ?? ''));
  return s;
}
