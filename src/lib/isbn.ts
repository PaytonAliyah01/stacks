import type { Book } from '../types';
/** Strip everything except digits and a trailing X. */
export function cleanIsbn(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9X]/g, '');
}

export function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = s[i] === 'X' ? 10 : Number(s[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(s: string): boolean {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

export function isbn10to13(s: string): string {
  const core = '978' + s.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + ((10 - (sum % 10)) % 10);
}

export function isbn13to10(s: string): string | undefined {
  if (!s.startsWith('978')) return undefined;
  const core = s.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

export type ParsedIsbn =
  | { ok: true; isbn13: string; isbn10?: string }
  | { ok: false; reason: string };

/**
 * Accepts what a barcode scanner or a person types. Book barcodes are EAN-13
 * starting 978/979; some scanners also send the 5-digit price add-on, which
 * we drop.
 */
export function parseIsbn(raw: string): ParsedIsbn {
  let s = cleanIsbn(raw);
  if (/^97[89]\d{15}$/.test(s)) s = s.slice(0, 13); // EAN-13 + 5-digit add-on
  if (/^97[89]\d{12}$/.test(s)) s = s.slice(0, 13); // EAN-13 + 2-digit add-on
  if (s.length === 13) {
    if (!isValidIsbn13(s)) {
      return {
        ok: false,
        reason: /^97[89]/.test(s)
          ? 'That ISBN has a bad check digit. Try scanning again.'
          : "That barcode isn't an ISBN. Book barcodes start with 978 or 979.",
      };
    }
    return { ok: true, isbn13: s, isbn10: isbn13to10(s) };
  }
  if (s.length === 10) {
    if (!isValidIsbn10(s)) return { ok: false, reason: 'That ISBN-10 has a bad check digit.' };
    return { ok: true, isbn13: isbn10to13(s), isbn10: s };
  }
  if (s.length === 12) {
    return { ok: false, reason: 'That looks like a UPC code. Scan the barcode that starts with 978 or 979.' };
  }
  return { ok: false, reason: 'An ISBN has 10 or 13 digits.' };
}

export function formatIsbn13(s: string): string {
  return s.length === 13 ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
}

/** GTIN check digit (UPC-A, EAN-8, EAN-13). */
export function isValidGtin(s: string): boolean {
  if (!/^\d{8}$|^\d{12,13}$/.test(s)) return false;
  let sum = 0;
  const digits = s.split('').reverse().map(Number);
  for (let i = 1; i < digits.length; i++) sum += digits[i] * (i % 2 === 1 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === digits[0];
}

export type ParsedScan =
  | { type: 'isbn'; isbn13: string; isbn10?: string }
  | { type: 'barcode'; code: string } // a record, CD or other product barcode
  | { type: 'invalid'; reason: string };

/** A book ISBN, or any other valid product barcode (records and CDs use UPC/EAN). */
export function parseScan(raw: string): ParsedScan {
  const isbn = parseIsbn(raw);
  if (isbn.ok) return { type: 'isbn', isbn13: isbn.isbn13, isbn10: isbn.isbn10 };
  let s = cleanIsbn(raw).replace(/X/g, '');
  if (/^\d{17,18}$/.test(s)) s = s.slice(0, s.length - 5); // 5-digit add-on
  else if (/^\d{14,15}$/.test(s)) s = s.slice(0, s.length - 2); // 2-digit add-on
  if (!/^97[89]/.test(s) && isValidGtin(s)) return { type: 'barcode', code: s };
  return { type: 'invalid', reason: /^97[89]/.test(s) ? isbn.reason : "That barcode didn't read right. Try scanning again." };
}

/** The ISBN or barcode typed in the drawer, checked. Returns the fields to save, or what's wrong with it. */
export function identityFromInput(isbn: string, music: boolean): { patch: Partial<Book> } | { error: string } {
  const patch: Partial<Book> = { isbn13: undefined, isbn10: undefined, barcode: undefined };
  if (!isbn.trim()) return { patch };
  if (!music) {
    const p = parseIsbn(isbn);
    if (!p.ok) return { error: p.reason };
    return { patch: { ...patch, isbn13: p.isbn13, isbn10: p.isbn10 } };
  }
  const p = parseScan(isbn);
  if (p.type !== 'barcode') return { error: "That barcode doesn't look right. Check the numbers under the bars." };
  return { patch: { ...patch, barcode: p.code } };
}
