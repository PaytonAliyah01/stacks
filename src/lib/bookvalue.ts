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
  /** What you paid in other currencies, by currency code. */
  paidOther: Record<string, number>;
  /** Books with a value or a price paid, most valuable first. */
  top: { b: Book; v?: BookValue }[];
}

/** Adds one book's value to the totals; returns it when it counts (in your currency). */
function countValue(s: BookValueSummary, v: BookValue | undefined, copies: number, currency: string): BookValue | undefined {
  if (!v) {
    s.missing += copies;
    return undefined;
  }
  if (v.currency !== currency) {
    s.otherCurrency++;
    return undefined;
  }
  s.total += v.amount * copies;
  s.valued += copies;
  if (v.source === 'yours') s.yours += copies;
  else s.looked += copies;
  return v;
}

/** Owned books only: wishlist books and records are left out. */
export function summarizeBooks(all: Book[], currency: string): BookValueSummary {
  const s: BookValueSummary = { currency, total: 0, yours: 0, looked: 0, missing: 0, copies: 0, valued: 0, otherCurrency: 0, paid: 0, paidOther: {}, top: [] };
  for (const b of all) {
    if (isMusic(b) || b.owned === false) continue;
    const copies = Math.max(1, b.copies);
    s.copies += copies;
    if (b.pricePaid !== undefined) {
      const pc = b.currency ?? currency;
      if (pc === currency) s.paid += b.pricePaid * copies;
      else s.paidOther[pc] = (s.paidOther[pc] ?? 0) + b.pricePaid * copies;
    }
    const v = countValue(s, bookValue(b, currency), copies, currency);
    if (v || b.pricePaid !== undefined) s.top.push({ b, v });
  }
  s.top.sort((a, b) => (b.v?.amount ?? -1) - (a.v?.amount ?? -1) || (b.b.pricePaid ?? 0) - (a.b.pricePaid ?? 0));
  return s;
}
