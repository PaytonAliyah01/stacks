import type { Book } from '../types';
import { isMusic } from '../types';

/**
 * What your books are worth: today's price in the Google Books store, or your
 * own estimate when you set one. Records and CDs use Discogs (see value.ts).
 */
export interface BookValue {
  amount: number;
  currency: string;
  source: 'yours' | 'store' | 'ebook';
}

/** Your own estimate when you set one, otherwise today's Google Books price. */
export function bookValue(b: Book, currency: string): BookValue | undefined {
  if (b.myValue !== undefined) return { amount: b.myValue, currency: b.currency ?? currency, source: 'yours' };
  const p = b.bookPrice?.store;
  return p ? { amount: p.amount, currency: p.currency, source: p.ebook ? 'ebook' : 'store' } : undefined;
}

export interface BookValueSummary {
  currency: string;
  total: number;
  yours: number;
  /** Copies valued at today's Google Books price. */
  looked: number;
  /** Owned books with no price yet. */
  missing: number;
  copies: number;
  valued: number;
  /** Values set in another currency, left out of the total. */
  otherCurrency: number;
  paid: number;
  top: { b: Book; v: BookValue }[];
}

/** Owned books only: wishlist books and records are left out. */
export function summarizeBooks(all: Book[], currency: string): BookValueSummary {
  const s: BookValueSummary = { currency, total: 0, yours: 0, looked: 0, missing: 0, copies: 0, valued: 0, otherCurrency: 0, paid: 0, top: [] };
  for (const b of all) {
    if (isMusic(b) || b.owned === false) continue;
    const copies = Math.max(1, b.copies);
    s.copies += copies;
    if (b.pricePaid !== undefined && (b.currency ?? currency) === currency) s.paid += b.pricePaid * copies;
    const v = bookValue(b, currency);
    if (!v) {
      s.missing += copies;
      continue;
    }
    if (v.currency !== currency) {
      s.otherCurrency++;
      continue;
    }
    s.total += v.amount * copies;
    s.valued += copies;
    if (v.source === 'yours') s.yours += copies;
    else s.looked += copies;
    s.top.push({ b, v });
  }
  s.top.sort((a, b) => b.v.amount - a.v.amount || (a.v.source === 'yours' ? -1 : 1));
  return s;
}
