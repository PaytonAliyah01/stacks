// Small string helpers that walk the text once, so a long or odd title can't make a regex backtrack.

const CLOSERS: Record<string, string> = { '(': ')', '[': ']' };

/** Takes out "(…)" and "[…]" parts: "Rumours (Deluxe) [Remastered]" → "Rumours  ". An opener with no closer stays. */
export function stripBrackets(s: string, fill = '', closers: Record<string, string> = CLOSERS): string {
  let out = '';
  let i = 0;
  const unclosed = new Set<string>();
  while (i < s.length) {
    const close = closers[s[i]];
    const end = close && !unclosed.has(close) ? s.indexOf(close, i + 1) : -1;
    if (end >= 0) {
      out += fill;
      i = end + 1;
    } else {
      if (close) unclosed.add(close);
      out += s[i];
      i += 1;
    }
  }
  return out;
}

/** Takes HTML tags out of a description: "<p>Hi</p>" → "Hi". */
export const stripTags = (s: string) => stripBrackets(s, '', { '<': '>' });

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const allDigits = (s: string) => s.length > 0 && [...s].every(isDigit);

/** Drops a trailing "(…)" note: "Near Mint (NM or M-)" → "Near Mint". */
export function dropTrailingNote(s: string): string {
  const open = s.indexOf('(');
  return s.endsWith(')') && open >= 0 ? s.slice(0, open).trimEnd() : s;
}

/** Drops the number Discogs adds to tell names apart: "Prince (2)" → "Prince". */
export function dropDiscogsNumber(s: string): string {
  if (!s.endsWith(')')) return s;
  const open = s.lastIndexOf('(');
  return open >= 0 && allDigits(s.slice(open + 1, -1)) ? s.slice(0, open).trimEnd() : s;
}

/** The text inside the first "( )": "Near Mint (NM or M-)" → "NM or M-". */
export function insideParens(s: string): string | undefined {
  const open = s.indexOf('(');
  const close = open >= 0 ? s.indexOf(')', open + 1) : -1;
  return close > open + 1 ? s.slice(open + 1, close) : undefined;
}

const isSpace = (c: string | undefined) => c !== undefined && c.trim() === '';

/** Trims any of these characters (and whitespace) off the end. */
export function trimEndOf(s: string, chars: string): string {
  let end = s.length;
  while (end > 0 && (isSpace(s[end - 1]) || chars.includes(s[end - 1]))) end -= 1;
  return s.slice(0, end);
}

/** Trims any of these characters (and whitespace) off the start. */
export function trimStartOf(s: string, chars: string): string {
  let start = 0;
  while (start < s.length && (isSpace(s[start]) || chars.includes(s[start]))) start += 1;
  return s.slice(start);
}

/** Where a run of digits that ends at `end` starts. */
export function digitsBefore(s: string, end: number): number {
  let i = end;
  while (i > 0 && isDigit(s[i - 1])) i -= 1;
  return i;
}

// "#", "book ", "bk.", "vol." that can come before a number at the end of a series name.
const NUMBER_WORDS = ['#', 'book', 'bk.', 'bk', 'vol.', 'vol'];

/**
 * Takes a book number off the end of a series name: "The Empyrean 3.5" → "The Empyrean",
 * "Wheel of Time, Book 4" → "Wheel of Time". Leaves names that are only a number alone.
 */
export function dropTrailingBookNumber(s: string): string {
  const text = s.trimEnd();
  let i = digitsBefore(text, text.length);
  if (i === text.length) return s;
  if (i > 1 && (text[i - 1] === '.' || text[i - 1] === ',') && isDigit(text[i - 2])) i = digitsBefore(text, i - 1);
  let head = text.slice(0, i);
  const bare = head.trimEnd();
  const lower = bare.toLowerCase();
  const word = NUMBER_WORDS.find((w) => lower.endsWith(w) && (w !== 'book' || bare.length < head.length));
  if (word) head = bare.slice(0, bare.length - word.length);
  head = trimEndOf(head, ',;:#-');
  const last = head[head.length - 1];
  return last === undefined || isDigit(last) ? s : head;
}

const DURATION = /^\d{1,2}:\d{2}(?::\d{2})?$/;

/** Splits a duration off the end of a track line: "Airbag (4:44)" → ["Airbag", "4:44"]. */
export function splitTrailingDuration(line: string): [string, string | undefined] {
  let end = line.trimEnd().length;
  if (line[end - 1] === ')') end -= 1;
  let start = end;
  while (start > 0 && (isDigit(line[start - 1]) || line[start - 1] === ':')) start -= 1;
  const duration = line.slice(start, end);
  if (!DURATION.test(duration)) return [line, undefined];
  return [trimEndOf(line.slice(0, start), '([–-').trim(), duration];
}
