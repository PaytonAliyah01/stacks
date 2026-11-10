import { BOOKCASE_PRESETS, spineCm, type Book, type Bookcase, type BookcaseType, type Placement } from '../types';
import { newId } from './storage';
import { without } from './omit';

export interface Spot {
  bookcaseId: string;
  shelf: number;
  section: number;
}

export const sameSpot = (p: Spot | undefined, s: Spot | undefined) =>
  !!p && !!s && p.bookcaseId === s.bookcaseId && p.shelf === s.shelf && p.section === s.section;

/** Books on one shelf section, left to right. */
export function booksAt(books: Book[], spot: Spot): Book[] {
  return books
    .filter((b) => sameSpot(b.placement, spot))
    .sort((a, b) => a.placement!.position - b.placement!.position);
}

export function usedCm(books: Book[]): number {
  return books.reduce((n, b) => n + spineCm(b) * b.copies, 0);
}

export function spotName(bc: Bookcase, s: Pick<Spot, 'shelf' | 'section'>): string {
  if (s.shelf === 0) return 'On top';
  return bc.sections > 1 ? `Row ${s.shelf}, cube ${s.section}` : `Shelf ${s.shelf}`;
}

/** "Living room Billy · Shelf 2 · Book 3" */
export function placeLabel(book: Book, bookcases: Bookcase[]): string {
  const p = book.placement;
  if (!p) return '';
  const bc = bookcases.find((c) => c.id === p.bookcaseId);
  if (!bc) return '';
  const noun = book.kind === 'vinyl' ? 'Record' : book.kind === 'cd' ? 'CD' : 'Book';
  return `${bc.name} · ${spotName(bc, p)} · ${noun} ${p.position}`;
}

/**
 * Put `book` at `index` (0-based) in `target`, or take it off the shelves when
 * `target` is null. Returns every book whose placement changed, with positions
 * renumbered 1..n in both the old and new sections.
 */
export function moveBook(all: Book[], bookId: string, target: Spot | null, index = Infinity): Book[] {
  const book = all.find((b) => b.id === bookId);
  if (!book) return [];
  const now = new Date().toISOString();
  const changed = new Map<string, Book>();
  const renumber = (list: Book[], spot: Spot) =>
    list.forEach((b, i) => {
      const placement: Placement = { ...spot, position: i + 1 };
      const cur = changed.get(b.id) ?? b;
      if (!b.placement || !sameSpot(b.placement, spot) || b.placement.position !== i + 1 || b.id === bookId) {
        changed.set(b.id, { ...cur, placement, updatedAt: now });
      }
    });

  const from = book.placement;
  if (from && !sameSpot(from, target ?? undefined)) {
    renumber(booksAt(all, from).filter((b) => b.id !== bookId), from);
  }
  if (target) {
    const list = booksAt(all, target).filter((b) => b.id !== bookId);
    list.splice(Math.max(0, Math.min(index, list.length)), 0, book);
    renumber(list, target);
  } else if (from) {
    const rest = without(book, 'placement');
    changed.set(bookId, { ...rest, updatedAt: now });
  }
  return [...changed.values()];
}

export function nextPosition(all: Book[], spot: Spot): number {
  return booksAt(all, spot).length + 1;
}

export function newBookcase(type: BookcaseType, order: number, name?: string): Bookcase {
  const p = BOOKCASE_PRESETS[type];
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: name ?? (type.startsWith('billy') ? 'Billy' : type.startsWith('kallax') ? 'Kallax' : 'Bookcase'),
    type,
    shelves: p.shelves,
    sections: p.sections,
    sectionWidthCm: p.sectionWidthCm,
    color: 'white',
    order,
    createdAt: now,
    updatedAt: now,
  };
}

export const topSpot = (bc: Bookcase): Spot => ({ bookcaseId: bc.id, shelf: 0, section: 1 });

/** Every spot including the top of the bookcase, for pickers. */
export function allSpotsOf(bc: Bookcase): Spot[] {
  return [topSpot(bc), ...spotsOf(bc)];
}

/** Every shelf spot inside a bookcase, top-left to bottom-right. */
export function spotsOf(bc: Bookcase): Spot[] {
  const out: Spot[] = [];
  for (let shelf = 1; shelf <= bc.shelves; shelf++)
    for (let section = 1; section <= bc.sections; section++) out.push({ bookcaseId: bc.id, shelf, section });
  return out;
}
