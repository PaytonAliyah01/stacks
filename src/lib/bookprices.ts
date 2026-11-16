import type { Book, BookPrice } from '../types';
import { getGoogle, withGoogleKey } from './lookup';

/** Prices older than this are checked again. */
export const BOOK_PRICE_DAYS = 30;
export const priceIsStale = (b: Book, now = Date.now()) => !b.bookPrice || now - Date.parse(b.bookPrice.checkedAt) > BOOK_PRICE_DAYS * 86_400_000;

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

/** The Google Books store price for this ISBN, preferring a print edition over the ebook. */
export async function googleStorePrice(isbn13: string, country: string): Promise<BookPrice['store']> {
  const url = withGoogleKey(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}&country=${country}&fields=items(saleInfo)`);
  const data = (await getGoogle(url)) as { items?: { saleInfo?: SaleInfo }[] };
  const offers = (data.items ?? [])
    .map((i) => i.saleInfo)
    .filter((s): s is SaleInfo => !!s && s.saleability === 'FOR_SALE')
    .map((s) => ({ p: s.retailPrice?.amount !== undefined ? s.retailPrice : s.listPrice, ebook: !!s.isEbook }))
    .filter((o) => o.p?.amount !== undefined && o.p.currencyCode)
    .sort((a, b) => Number(a.ebook) - Number(b.ebook));
  const o = offers[0];
  return o ? { amount: o.p!.amount!, currency: o.p!.currencyCode!, ebook: o.ebook } : undefined;
}

/** Books whose price can be looked up: owned, with an ISBN, and not checked lately. */
export const booksToPrice = (all: Book[]) => all.filter((b) => b.kind !== 'vinyl' && b.kind !== 'cd' && b.owned !== false && b.isbn13 && priceIsStale(b));
