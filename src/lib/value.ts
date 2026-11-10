import type { Book } from '../types';
import { formatMoney } from '../types';
import { formatDay } from './reading';

/** Currencies the Discogs marketplace can quote in. */
export const DISCOGS_CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'BRL', 'NZD', 'SEK', 'ZAR'];
export const marketCurrency = (c: string) => (DISCOGS_CURRENCIES.includes(c) ? c : 'USD');

/** Prices older than this get refreshed by "Update prices". */
export const STALE_DAYS = 30;

export interface Valued {
  amount: number;
  currency: string;
  /** Where the number comes from. */
  source: 'yours' | 'suggested' | 'lowest';
}

/** What one copy is worth: your own estimate, else Discogs' suggested price for its condition, else the lowest price on sale. */
export function valueOf(b: Book, fallbackCurrency: string): Valued | undefined {
  if (b.myValue !== undefined) return { amount: b.myValue, currency: b.currency ?? fallbackCurrency, source: 'yours' };
  if (b.market?.suggested !== undefined) return { amount: b.market.suggested, currency: b.market.currency, source: 'suggested' };
  if (b.market?.lowest !== undefined) return { amount: b.market.lowest, currency: b.market.currency, source: 'lowest' };
  return undefined;
}

export const isStale = (b: Book, now = Date.now()) => !b.market || now - Date.parse(b.market.checkedAt) > STALE_DAYS * 86_400_000;

export interface ValueSummary {
  currency: string;
  total: number;
  /** Copies with a value. */
  valued: number;
  /** What you paid for the records that have both a value and a price, in the same currency. */
  paid: number;
  worthOfPaid: number;
  compared: number;
  missing: Book[];
  /** Values in another currency, left out of the total. */
  otherCurrency: number;
  top: { b: Book; v: Valued; gain?: number }[];
  lastChecked?: string;
}

export function summarize(records: Book[], currency: string): ValueSummary {
  const s: ValueSummary = { currency, total: 0, valued: 0, paid: 0, worthOfPaid: 0, compared: 0, missing: [], otherCurrency: 0, top: [] };
  for (const b of records) {
    const v = valueOf(b, currency);
    if (b.market && (!s.lastChecked || b.market.checkedAt > s.lastChecked)) s.lastChecked = b.market.checkedAt;
    if (!v) {
      s.missing.push(b);
      continue;
    }
    if (v.currency !== currency) {
      s.otherCurrency++;
      continue;
    }
    const copies = Math.max(1, b.copies);
    s.total += v.amount * copies;
    s.valued += copies;
    const samePaid = b.pricePaid !== undefined && (b.currency ?? currency) === currency;
    if (samePaid) {
      s.paid += b.pricePaid! * copies;
      s.worthOfPaid += v.amount * copies;
      s.compared++;
    }
    s.top.push({ b, v, gain: samePaid ? v.amount - b.pricePaid! : undefined });
  }
  s.top.sort((a, b) => b.v.amount - a.v.amount);
  return s;
}

export const discogsReleaseUrl = (id: number) => `https://www.discogs.com/release/${id}`;
export const discogsSellUrl = (id: number) => `https://www.discogs.com/sell/release/${id}`;

/** One line about a record's Discogs price, for its panel. */
export function marketLine(b: Book, currency: string): string {
  const v = valueOf({ ...b, myValue: undefined }, currency);
  if (!b.market) return b.discogsId ? 'Press Update prices on Music → Stats → What it’s worth to get the Discogs price.' : 'Not linked to Discogs, so there is no market price.';
  const parts = [
    b.market.suggested !== undefined && `suggested ${formatMoney(b.market.suggested, b.market.currency)}`,
    b.market.lowest !== undefined && `lowest on sale ${formatMoney(b.market.lowest, b.market.currency)}`,
    b.market.forSale !== undefined && `${b.market.forSale} for sale`,
  ].filter(Boolean);
  return `${v ? 'Discogs: ' : 'Discogs has no copies on sale. '}${parts.join(' · ')} (${formatDay(b.market.checkedAt)})`;
}
