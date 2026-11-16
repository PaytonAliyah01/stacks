import type { Book, BookPrice } from '../types';
import { getGoogle, withGoogleKey } from './lookup';

/** Prices older than this are checked again. */
export const BOOK_PRICE_DAYS = 30;
/** The current way of looking prices up; books checked the older way without finding a price get another go. */
export const BOOK_PRICE_VERSION = 2;
export const priceIsStale = (b: Book, now = Date.now()) =>
  !b.bookPrice ||
  (!b.bookPrice.store && (b.bookPrice.v ?? 1) < BOOK_PRICE_VERSION) ||
  now - Date.parse(b.bookPrice.checkedAt) > BOOK_PRICE_DAYS * 86_400_000;

const EURO_COUNTRY: Record<string, string> = { EUR: 'NL', USD: 'US', GBP: 'GB', CAD: 'CA', AUD: 'AU', NZD: 'NZ', CHF: 'CH', SEK: 'SE', NOK: 'NO', DKK: 'DK', PLN: 'PL' };

/** The country whose Google Books store to ask: your browser's region, else one that uses your currency. */
export function storeCountry(currency: string): string {
  const region = /-([A-Z]{2})\b/.exec(navigator.language ?? '')?.[1];
  return region ?? EURO_COUNTRY[currency] ?? 'US';
}

interface SaleInfo {
  saleability?: string;
  isEbook?: boolean;
  retailPrice?: { amount?: number; currencyCode?: string };
  listPrice?: { amount?: number; currencyCode?: string };
}

interface Volume {
  volumeInfo?: { title?: string; authors?: string[] };
  saleInfo?: SaleInfo;
}

/** The cheapest-to-trust offer among these volumes: a print edition before an ebook. */
function bestOffer(items: Volume[]): BookPrice['store'] {
  const offers = items
    .map((i) => i.saleInfo)
    .filter((s): s is SaleInfo => !!s && s.saleability === 'FOR_SALE')
    .map((s) => ({ p: s.retailPrice?.amount !== undefined ? s.retailPrice : s.listPrice, ebook: !!s.isEbook }))
    .filter((o) => o.p?.amount !== undefined && o.p.currencyCode)
    .sort((a, b) => Number(a.ebook) - Number(b.ebook));
  const o = offers[0];
  return o ? { amount: o.p!.amount!, currency: o.p!.currencyCode!, ebook: o.ebook } : undefined;
}

/** Lower-case letters and digits only, for comparing titles and names. */
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').trim();
/** The main title, without a subtitle or series note. */
const mainTitle = (t: string) => plain(t.split(/[:(]/)[0]);
const lastName = (a: string) => plain(a).split(' ').pop() ?? '';

/** True when a store volume is the same book: same main title, and the same author when both have one. */
function sameWork(v: Volume, book: Pick<Book, 'title' | 'authors'>): boolean {
  const t = mainTitle(v.volumeInfo?.title ?? '');
  if (!t || t !== mainTitle(book.title)) return false;
  const want = book.authors.map(lastName).filter(Boolean);
  const have = (v.volumeInfo?.authors ?? []).map(lastName);
  return !want.length || !have.length || want.some((a) => have.includes(a));
}

/**
 * Today's Google Books store price for a book. Asks by ISBN first; your edition is often
 * not sold, so when it has no price, looks for another edition (usually the ebook) by title and author.
 */
export async function googleStorePrice(book: Pick<Book, 'isbn13' | 'title' | 'authors'>, country: string): Promise<BookPrice['store']> {
  const ask = async (q: string) =>
    ((await getGoogle(withGoogleKey(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&country=${country}&maxResults=20&fields=items(volumeInfo(title,authors),saleInfo)`))) as { items?: Volume[] }).items ?? [];
  if (book.isbn13) {
    const byIsbn = bestOffer(await ask(`isbn:${book.isbn13}`));
    if (byIsbn) return byIsbn;
  }
  const title = mainTitle(book.title);
  if (!title) return undefined;
  const author = book.authors[0] ? ` inauthor:${book.authors[0]}` : '';
  const hits = await ask(`intitle:${book.title.split(/[:(]/)[0].trim()}${author}`);
  return bestOffer(hits.filter((v) => sameWork(v, book)));
}

/** Books whose price can be looked up: owned, with a title, and not checked lately. */
export const booksToPrice = (all: Book[]) => all.filter((b) => b.kind !== 'vinyl' && b.kind !== 'cd' && b.owned !== false && b.title.trim() && priceIsStale(b));
