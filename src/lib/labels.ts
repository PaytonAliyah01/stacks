
/** "Vinyl" or "CD" for records, nothing for books. */
export function formatWord(kind?: string): string | undefined {
  if (kind === 'vinyl') return 'Vinyl';
  if (kind === 'cd') return 'CD';
  return undefined;
}

/** CSS class for a gain or loss: "gain", "loss", or "" when unknown. */
export function gainClass(g: number | undefined): string {
  if (g === undefined) return '';
  return g >= 0 ? 'gain' : 'loss';
}

/** "book"/"books" or "page"/"pages". */
export function unitWord(measure: 'books' | 'pages', n: number): string {
  const one = measure === 'books' ? 'book' : 'page';
  return n === 1 ? one : `${one}s`;
}

/** Billy, Kallax or Bookcase, from the bookcase type. */
export function bookcaseName(type: string): string {
  if (type.startsWith('billy')) return 'Billy';
  return type.startsWith('kallax') ? 'Kallax' : 'Bookcase';
}

/** How far a point lies outside a range (0 when inside). */
export function outside(v: number, lo: number, hi: number): number {
  if (v < lo) return lo - v;
  return v > hi ? v - hi : 0;
}

/** "1 book", "3 books"; pass `many` for irregular plurals. */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a record" or "3 records". */
export const recordsText = (n: number) => (n === 1 ? 'a record' : countOf(n, 'record'));
