import type { Book, Reading } from '../types';
import { currentReading } from './reading';
import { matchKey } from './importHistory';
import { isValidIsbn10, isbn10to13 } from './isbn';

/** Books to buy: ones you put on the wishlist, plus want-to-reads you don't own. */
export function wishlistOf(books: Book[], readings: Reading[]): Book[] {
  return books.filter((b) => b.owned === false && (b.wishlist || currentReading(readings, b.id)?.status === 'want'));
}

/** Finds books in Stacks that match what was typed: an ISBN, or words from the title or author. */
export function findMatches(books: Book[], query: string): Book[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const digits = q.replace(/[^0-9x]/g, '');
  if (digits.length >= 10 && digits.length === q.replace(/[\s-]/g, '').length) {
    const as13 = digits.length === 10 && isValidIsbn10(digits.toUpperCase()) ? isbn10to13(digits.toUpperCase()) : digits;
    return books.filter((b) => b.isbn13 === as13 || b.barcode === digits || (b.barcode && `0${b.barcode}` === digits) || b.barcode === `0${digits}`);
  }
  const words = q.split(/\s+/).filter(Boolean);
  return books.filter((b) => {
    const hay = `${b.title} ${b.subtitle ?? ''} ${b.authors.join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The same book already in Stacks, by ISBN or by title and author. */
export function sameBook(books: Book[], candidate: { isbn13?: string; title: string; authors: string[] }): Book | undefined {
  return (
    (candidate.isbn13 && books.find((b) => b.isbn13 === candidate.isbn13)) ||
    books.find((b) => matchKey(b.title, b.authors[0]) === matchKey(candidate.title, candidate.authors[0]))
  );
}
