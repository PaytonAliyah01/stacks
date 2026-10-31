import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BOOKCASE_PRESETS, itemHeightCm, kindOf, spineCm, type Book, type Bookcase } from '../types';
import { useCoverColor } from '../lib/coverColor';
import { allSpotsOf, booksAt, spotName, spotsOf, topSpot, usedCm, type Spot } from '../lib/shelving';

// Drawing scale at full size; "fit to window" shrinks it so the tallest bookcase fits.
const PX_PER_CM = 7;
const MIN_PX_PER_CM = 1.5;
const PREF_FIT = 'stacks.fitShelvesToWindow';
// Height of a shelf opening. Kallax cubes are made to take LPs.
const clearanceCm = (bc?: Bookcase) => (bc?.type.startsWith('kallax') ? 33 : 28);

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function spineHeightCm(b: Book, maxCm: number) {
  const base = itemHeightCm(b);
  // Books vary a little; records and CD cases are standard sizes.
  const jitter = kindOf(b) === 'book' ? ((hash(b.id) % 7) - 3) * 0.4 : 0;
  // Never draw taller than the shelf opening.
  return Math.min(base + jitter, maxCm - 0.8);
}

interface Props {
  books: Book[];
  bookcases: Bookcase[];
  highlightId?: string;
  onOpenBook: (b: Book) => void;
  onMove?: (bookId: string, spot: Spot | null, index?: number) => void;
  onAddBookcase?: () => void;
  onEditBookcase?: (bc: Bookcase) => void;
  /** Look only: no dragging, no adding or editing bookcases (a shared shelf link). */
  readOnly?: boolean;
}

interface DropTarget {
  key: string; // spot key or 'tray'
  index: number;
}

const keyOf = (s: Spot) => `${s.bookcaseId}:${s.shelf}:${s.section}`;

function Spine({ book, highlight, onOpen, maxCm = 28, scale = PX_PER_CM, fixed = false }: { book: Book; highlight: boolean; onOpen: () => void; maxCm?: number; scale?: number; fixed?: boolean }) {
  const h = hash(book.title);
  const kind = kindOf(book);
  // At least wide enough to read the title and author; records are thin, so a bit less.
  const k = scale / PX_PER_CM;
  const width = Math.max(Math.max(8, (kind === 'vinyl' ? 10 : 16) * k), spineCm(book) * scale);
  const height = spineHeightCm(book, maxCm) * scale;
  // Open Library lets us read cover colours; try its cover for this ISBN too,
  // in case the stored cover comes from a host that doesn't.
  const primary = useCoverColor(book.spineImage ? undefined : book.coverUrl);
  const byIsbn = useCoverColor(
    book.spineImage || primary || !book.isbn13 ? undefined : `https://covers.openlibrary.org/b/isbn/${book.isbn13}-M.jpg?default=false`,
  );
  const cover = primary ?? byIsbn;
  const tried = primary !== undefined && (primary !== null || byIsbn !== undefined || !book.isbn13);

  // Best to worst: the person's own spine photo, the cover's edge colour,
  // the cover blurred into its colours, a made-up colour.
  let look: React.CSSProperties;
  let lookKind: string;
  if (book.spineImage) {
    lookKind = 'photo';
    look = { backgroundImage: `url("${book.spineImage}")` };
  } else if (cover) {
    lookKind = 'cover-color';
    look = { ['--spine-bg' as string]: cover.bg, color: cover.fg };
  } else if (book.coverUrl && tried) {
    lookKind = 'cover-blur';
    look = { ['--cover' as string]: `url("${book.coverUrl}")` };
  } else {
    lookKind = 'made-up';
    look = {
      ['--spine-bg' as string]: `hsl(${h % 360} ${25 + (h % 30)}% ${28 + ((h >> 5) % 30)}%)`,
      color: `hsl(${h % 360} 30% 94%)`,
    };
  }

  return (
    <button
      type="button"
      className={`spine spine-${lookKind} item-${kind} ${highlight ? 'highlight' : ''} ${kind === 'book' && book.format === 'hardcover' ? 'hard' : ''}`}
      style={{ width, height, ...look }}
      draggable={!fixed}
      data-spine=""
      onDragStart={(e) => {
        if (fixed) return;
        e.dataTransfer.setData('text/plain', book.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onOpen}
      title={`${book.placement ? `${book.placement.position}. ` : ''}${book.title}${book.authors[0] ? ` by ${book.authors[0]}` : ''}${book.pageCount ? ` · ${book.pageCount} pages` : ''}`}
    >
      {lookKind !== 'photo' && (
        <span className={`spine-text ${width >= 20 && k > 0.7 ? 'two-line' : ''} ${width < 13 || k < 0.6 ? 'tiny' : ''}`}>
          <span className="spine-title">{book.title}</span>
          {book.authors[0] && <span className="spine-author">{book.authors.join(', ')}</span>}
        </span>
      )}
      {book.copies > 1 && <span className="spine-copies">×{book.copies}</span>}
    </button>
  );
}

export function ShelvesView({ books, bookcases, highlightId, onOpenBook, onMove, onAddBookcase, onEditBookcase, readOnly = false }: Props) {
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const casesRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(() => {
    try {
      return localStorage.getItem(PREF_FIT) === '1';
    } catch {
      return false;
    }
  });
  const [scale, setScale] = useState(PX_PER_CM);

  // Shrink the drawing until the tallest bookcase, with what's on top of it, fits the window.
  const tallest = Math.max(
    0,
    ...bookcases.map((bc) => {
      const top = booksAt(books, topSpot(bc));
      const topCm = top.length ? Math.min(40, Math.max(...top.map(itemHeightCm))) : 0;
      return bc.shelves * clearanceCm(bc) + topCm;
    }),
  );
  const shelfCount = Math.max(1, ...bookcases.map((bc) => bc.shelves));
  useLayoutEffect(() => {
    if (!fit) return setScale(PX_PER_CM);
    const measure = () => {
      const el = casesRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      // Header, labels, frame padding, gaps between shelves and a little room below.
      const fixed = 50 + 20 + 46 + 20 + shelfCount * 10 + 24;
      const room = window.innerHeight - top - fixed;
      setScale(Math.max(MIN_PX_PER_CM, Math.min(PX_PER_CM, room / Math.max(1, tallest))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fit, tallest, shelfCount]);
  const unshelved = books.filter((b) => !b.placement || !bookcases.some((c) => c.id === b.placement!.bookcaseId));

  useEffect(() => {
    if (highlightId) document.querySelector('.spine.highlight')?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [highlightId]);

  // Where in a row of spines the pointer is: before the first spine whose middle is right of it.
  const indexFromPointer = (el: HTMLElement, x: number) => {
    const spines = [...el.querySelectorAll<HTMLElement>('[data-spine]')];
    const i = spines.findIndex((s) => {
      const r = s.getBoundingClientRect();
      return x < r.left + r.width / 2;
    });
    return i === -1 ? spines.length : i;
  };

  // Every shelf area on screen, so a drop anywhere on or near a bookcase can
  // go to the closest one.
  const slotEls = useRef(new Map<string, HTMLElement>());
  const slotRef = (key: string) => (el: HTMLElement | null) => {
    if (el) slotEls.current.set(key, el);
    else slotEls.current.delete(key);
  };

  const nearestSpot = (bc: Bookcase, x: number, y: number) => {
    let best: { spot: Spot; key: string; el: HTMLElement } | null = null;
    let bestD = Infinity;
    for (const spot of allSpotsOf(bc)) {
      const key = keyOf(spot);
      const el = slotEls.current.get(key);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { spot, key, el };
      }
    }
    return best;
  };

  const caseDrop = (bc: Bookcase) => ({
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      const n = nearestSpot(bc, e.clientX, e.clientY);
      if (!n) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const index = indexFromPointer(n.el, e.clientX);
      if (drop?.key !== n.key || drop.index !== index) setDrop({ key: n.key, index });
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const n = nearestSpot(bc, e.clientX, e.clientY);
      setDrop(null);
      if (id && n) onMove?.(id, n.spot, indexFromPointer(n.el, e.clientX));
    },
  });

  const trayDrop = {
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (drop?.key !== 'tray') setDrop({ key: 'tray', index: 0 });
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop((d) => (d?.key === 'tray' ? null : d));
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      setDrop(null);
      if (id) onMove?.(id, null);
    },
  };

  const spineRow = (spot: Spot, key: string, maxCm: number) => {
    const here = booksAt(books, spot);
    const target = drop?.key === key ? drop.index : -1;
    return (
      <div className="spine-row">
        {here.map((b, i) => (
          <span key={b.id} className="spine-cell">
            {target === i && <i className="drop-marker" />}
            <Spine book={b} highlight={b.id === highlightId} onOpen={() => onOpenBook(b)} maxCm={maxCm} scale={scale} fixed={readOnly} />
          </span>
        ))}
        {target === here.length && <i className="drop-marker" />}
      </div>
    );
  };

  if (bookcases.length === 0) {
    return (
      <div className="empty">
        <div className="empty-shelf" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <h3>Set up your first bookcase</h3>
        <p>Pick the kind of bookcase you have, like an IKEA Billy or Kallax, and Stacks draws it with your books on it. Then drag books onto shelves, or choose a shelf before you scan and each new book goes straight there, in order.</p>
        {!readOnly && <button className="btn primary" onClick={onAddBookcase}>Add a bookcase</button>}
      </div>
    );
  }

  return (
    <div className="shelves" ref={hlRef} style={{ ['--k' as string]: scale / PX_PER_CM }}>
      <label className="check fit-toggle">
        <input
          type="checkbox"
          checked={fit}
          onChange={(e) => {
            setFit(e.target.checked);
            try {
              localStorage.setItem(PREF_FIT, e.target.checked ? '1' : '0');
            } catch {
              /* preference only */
            }
          }}
        />
        Fit bookcases to the window
      </label>
      <div className="bookcases" ref={casesRef}>
        {bookcases.map((bc) => {
          const spots = spotsOf(bc);
          const onCase = books.filter((b) => b.placement?.bookcaseId === bc.id);
          const capacity = bc.sectionWidthCm * bc.shelves * bc.sections;
          const pct = Math.round((usedCm(onCase) / capacity) * 100);
          const width = bc.sectionWidthCm * scale;
          return (
            <section key={bc.id} className="bookcase-wrap" {...(readOnly ? {} : caseDrop(bc))}>
              <header className="bookcase-head">
                <div>
                  <h3>{bc.name}</h3>
                  <p className="muted small">
                    {BOOKCASE_PRESETS[bc.type].label} · {onCase.length} {onCase.length === 1 ? 'book' : 'books'} · {pct}% full
                  </p>
                </div>
                {!readOnly && <button className="btn ghost small-btn" onClick={() => onEditBookcase?.(bc)}>Edit</button>}
              </header>
              <div className="bookcase-scroll">
                {(() => {
                  const top = topSpot(bc);
                  const key = keyOf(top);
                  const count = booksAt(books, top).length;
                  return (
                    <div
                      ref={slotRef(key)}
                      className={`case-top ${drop?.key === key ? 'drop-on' : ''} ${count ? 'has-books' : ''}`}
                      aria-label={`On top of ${bc.name}`}
                    >
                      <span className="slot-label top-label">On top{count > 0 && ` · ${count}`}</span>
                      {spineRow(top, key, 40)}
                    </div>
                  );
                })()}
                <div
                  className={`bookcase wood-${bc.color}`}
                  style={{ gridTemplateColumns: `repeat(${bc.sections}, ${width}px)` }}
                >
                  {spots.map((spot) => {
                    const key = keyOf(spot);
                    const here = booksAt(books, spot);
                    const used = usedCm(here);
                    const over = used > bc.sectionWidthCm;
                    return (
                      <div
                        key={key}
                        ref={slotRef(key)}
                        className={`shelf-slot ${drop?.key === key ? 'drop-on' : ''}`}
                        style={{ height: clearanceCm(bc) * scale }}
                        aria-label={`${bc.name}, ${spotName(bc, spot)}`}
                      >
                        <span className={`slot-label ${over ? 'over' : ''}`}>
                          {spotName(bc, spot)}
                          {here.length > 0 && ` · ${here.length}`}
                          {over && ` · ${Math.ceil(used - bc.sectionWidthCm)} cm too many`}
                        </span>
                        {spineRow(spot, key, clearanceCm(bc))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
        {!readOnly && (
          <button className="add-bookcase" onClick={onAddBookcase}>
            <span aria-hidden="true">+</span> Add a bookcase
          </button>
        )}
      </div>

      {!(readOnly && unshelved.length === 0) && <section className={`tray ${drop?.key === 'tray' ? 'drop-on' : ''}`} {...(readOnly ? {} : trayDrop)} aria-label="Not on a bookcase">
        <div className="tray-head">
          <h3>Not on a bookcase</h3>
          <span className="muted small">
            {unshelved.length === 0
              ? 'Every book has a spot.'
              : readOnly
                ? `${unshelved.length} ${unshelved.length === 1 ? 'item' : 'items'}`
                : `${unshelved.length} ${unshelved.length === 1 ? 'book' : 'books'}. Drag them onto a shelf, or drag a book here to take it off.`}
          </span>
        </div>
        {unshelved.length > 0 && (
          <div className="tray-pile">
            {unshelved.slice(0, 300).map((b) => (
              <Spine key={b.id} book={b} highlight={b.id === highlightId} onOpen={() => onOpenBook(b)} scale={scale} fixed={readOnly} />
            ))}
          </div>
        )}
      </section>}
    </div>
  );
}

