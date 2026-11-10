import { useEffect, useState } from 'react';
import { CURRENCIES, FORMAT_LABELS, KIND_LABELS, isMusic, kindOf, type Book, type BookFormat, type Bookcase, type ItemKind, type BookNote, type Reading, type Spin, type VinylSize } from '../types';
import { SpinsPanel } from './SpinsPanel';
import { PressingPanel } from './PressingPanel';
import { TracksPanel } from './TracksPanel';
import { marketLine } from './ValueView';
import { discogsReleaseUrl } from '../lib/value';
import { ReadingPanel } from './ReadingPanel';
import { MoodPanel } from './MoodPanel';
import { NotesPanel } from './NotesPanel';
import { SeriesField } from './SeriesField';
import { booksAt, sameSpot, spotName } from '../lib/shelving';
import { formatIsbn13, parseIsbn, parseScan } from '../lib/isbn';
import { Cover } from './Cover';
import { spinePhotoToDataUrl } from '../lib/coverColor';
import { focusOnMount } from '../lib/focus';

interface Props {
  book: Book;
  isNew?: boolean; // manual entry for a book the databases didn't know
  onSave: (book: Book) => void;
  onDelete?: (id: string) => void;
  onRefresh?: (book: Book) => void;
  onShowOnShelf?: (book: Book) => void;
  onClose: () => void;
  books: Book[];
  bookcases: Bookcase[];
  defaultCurrency: string;
  onCurrencyChange: (code: string) => void;
  /** This book's read-throughs, newest first. */
  readings?: Reading[];
  onReadingChange?: (r: Reading) => void;
  onReadingRemove?: (id: string) => void;
  notes?: BookNote[];
  onNoteSave?: (n: BookNote) => void;
  onNoteRemove?: (id: string) => void;
  seriesNames?: string[];
  /** This record's plays. */
  spins?: Spin[];
  onSpin?: (at?: string) => void;
  onSpinRemove?: (id: string) => void;
  /** Save a change to the stored item right away, without closing the panel. */
  onQuickSave?: (patch: Partial<Book>) => void;
}

const splitList = (s: string) =>
  s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function BookDrawer({ book, isNew, onSave, onDelete, onRefresh, onShowOnShelf, onClose, books, bookcases, defaultCurrency, onCurrencyChange, readings = [], onReadingChange, onReadingRemove, notes = [], onNoteSave, onNoteRemove, seriesNames = [], spins = [], onSpin, onSpinRemove, onQuickSave }: Readonly<Props>) {
  const [draft, setDraft] = useState<Book>(book);
  const [authors, setAuthors] = useState(book.authors.join(', '));
  const [tags, setTags] = useState(book.tags.join(', '));
  const [isbn, setIsbn] = useState(book.isbn13 ?? book.barcode ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [editingMeta, setEditingMeta] = useState(isNew || book.sources.includes('manual'));
  const music = isMusic(draft);
  const kind = kindOf(draft);
  const noun = kind === 'cd' ? 'CD' : KIND_LABELS[kind].one.toLowerCase();

  useEffect(() => {
    setDraft(book);
    setAuthors(book.authors.join(', '));
    setTags(book.tags.join(', '));
    setIsbn(book.isbn13 ?? book.barcode ?? '');
    setConfirmDelete(false);
    setEditingMeta(isNew || book.sources.includes('manual'));
  }, [book, isNew]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof Book>(k: K, v: Book[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const place = draft.placement;
  const bc = bookcases.find((c) => c.id === place?.bookcaseId);
  // How many spots the book could take in the chosen section (its own included).
  const slotCount = place && bc ? booksAt(books, place).filter((b) => b.id !== book.id).length + 1 : 1;
  const endOf = (spot: { bookcaseId: string; shelf: number; section: number }) =>
    booksAt(books, spot).filter((b) => b.id !== book.id).length + 1;
  const setSpot = (bookcaseId: string, shelf: number, section: number) => {
    if (!bookcaseId) return set('placement', undefined);
    const spot = { bookcaseId, shelf, section };
    const keep = sameSpot(book.placement, spot) ? book.placement!.position : endOf(spot);
    set('placement', { ...spot, position: keep });
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return setError(music ? 'Give the album a title.' : 'Give the book a title.');
    const next: Book = {
      ...draft,
      title: draft.title.trim(),
      authors: splitList(authors),
      tags: splitList(tags),
      updatedAt: new Date().toISOString(),
    };
    if (editingMeta) {
      next.isbn13 = next.isbn10 = next.barcode = undefined;
      if (isbn.trim() && !music) {
        const p = parseIsbn(isbn);
        if (!p.ok) return setError(p.reason);
        next.isbn13 = p.isbn13;
        next.isbn10 = p.isbn10;
      } else if (isbn.trim()) {
        const p = parseScan(isbn);
        if (p.type !== 'barcode') return setError("That barcode doesn't look right. Check the numbers under the bars.");
        next.barcode = p.code;
      }
    }
    if (!music) {
      next.trackCount = next.discCount = next.vinylSize = undefined;
    }
    onSave(next);
  };

  return (
    <div className="drawer-backdrop">
      <button type="button" className="backdrop-close" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <dialog open className="drawer" aria-modal="true" aria-label={isNew ? `Add a ${noun}` : draft.title}>
        <form onSubmit={save} className="drawer-form">
          <header className="drawer-head">
            <Cover url={draft.coverUrl} title={draft.title || 'Untitled'} author={authors} size="lg" square={music} />
            <div className="drawer-title">
              {editingMeta ? (
                <>
                  <div className="kind-pick" role="radiogroup" aria-label="What is it?">
                    {(['book', 'vinyl', 'cd'] as ItemKind[]).map((k) => (
                      <label key={k} className={`kind-option ${kind === k ? 'on' : ''}`}>
                        <input type="radio" name="f-kind" value={k} checked={kind === k}
                          onChange={() => setDraft((d) => ({ ...d, kind: k, vinylSize: k === 'vinyl' ? d.vinylSize ?? 12 : undefined }))} />
                        {KIND_LABELS[k].one}
                      </label>
                    ))}
                  </div>
                  <label className="field">
                    <span>Title</span>
                    <input id="f-title" value={draft.title} onChange={(e) => set('title', e.target.value)} ref={isNew ? focusOnMount : undefined} />
                  </label>
                  <label className="field">
                    <span>{music ? 'Artist(s)' : 'Author(s)'}, separated by commas</span>
                    <input id="f-authors" value={authors} onChange={(e) => setAuthors(e.target.value)} ref={!isNew && !book.authors.length ? focusOnMount : undefined} />
                  </label>
                </>
              ) : (
                <>
                  <h2>{draft.title}</h2>
                  {draft.subtitle && <p className="subtitle">{draft.subtitle}</p>}
                  {draft.authors.length ? (
                    <p className="byline">{draft.authors.join(', ')}</p>
                  ) : (
                    <button type="button" className="link byline-add" onClick={() => setEditingMeta(true)}>
                      {music ? '+ Add the artist' : '+ Add the author'}
                    </button>
                  )}
                  <button type="button" className="link edit-details" onClick={() => setEditingMeta(true)}>
                    Edit title, {music ? 'artist' : 'author'} and details
                  </button>
                </>
              )}
            </div>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </header>

          {!isNew && music && onSpin && onSpinRemove && <SpinsPanel spins={spins} onSpin={onSpin} onRemove={onSpinRemove} />}

          {!isNew && music && onQuickSave && (
            <TracksPanel
              draft={draft}
              onSave={(patch) => {
                setDraft((d) => ({ ...d, ...patch }));
                onQuickSave(patch);
              }}
            />
          )}

          {music && <PressingPanel draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />}

          {!isNew && kind === 'book' && onReadingChange && onReadingRemove && (
            <ReadingPanel book={{ ...book, pageCount: draft.pageCount ?? book.pageCount }} readings={readings} onChange={onReadingChange} onRemove={onReadingRemove} />
          )}

          {kind === 'book' && <SeriesField key={book.id} draft={draft} knownNames={seriesNames} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />}

          {kind === 'book' && <MoodPanel draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />}

          {!isNew && kind === 'book' && onNoteSave && onNoteRemove && (
            <NotesPanel bookId={book.id} pageCount={draft.pageCount ?? book.pageCount} notes={notes} onSave={onNoteSave} onRemove={onNoteRemove} />
          )}

          {editingMeta ? (
            <div className="grid-2">
              <label className="field">
                <span>{music ? 'Barcode' : 'ISBN'}</span>
                <input id="f-isbn" value={isbn} onChange={(e) => setIsbn(e.target.value)} inputMode="numeric" />
              </label>
              <label className="field">
                <span>{music ? 'Label' : 'Publisher'}</span>
                <input id="f-publisher" value={draft.publisher ?? ''} onChange={(e) => set('publisher', e.target.value || undefined)} />
              </label>
              <label className="field">
                <span>{music ? 'Released' : 'Published'}</span>
                <input id="f-published" value={draft.publishedDate ?? ''} onChange={(e) => set('publishedDate', e.target.value || undefined)} placeholder="2021" />
              </label>
              {music ? (
                <label className="field">
                  <span>Tracks</span>
                  <input id="f-tracks" type="number" min={1} value={draft.trackCount ?? ''} onChange={(e) => set('trackCount', e.target.value ? Number(e.target.value) : undefined)} />
                </label>
              ) : (
                <label className="field">
                  <span>Pages</span>
                  <input id="f-pages" type="number" min={1} value={draft.pageCount ?? ''} onChange={(e) => set('pageCount', e.target.value ? Number(e.target.value) : undefined)} />
                </label>
              )}
            </div>
          ) : (
            <dl className="facts">
              {music ? (
                <>
                  <div><dt>Barcode</dt><dd className="mono">{draft.barcode ?? '—'}</dd></div>
                  <div><dt>Label</dt><dd>{draft.publisher ?? '—'}</dd></div>
                  <div><dt>Released</dt><dd>{draft.publishedDate ?? '—'}</dd></div>
                  <div><dt>Tracks</dt><dd className="mono">{draft.trackCount ?? '—'}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>ISBN</dt><dd className="mono">{draft.isbn13 ? formatIsbn13(draft.isbn13) : '—'}</dd></div>
                  <div><dt>Publisher</dt><dd>{draft.publisher ?? '—'}</dd></div>
                  <div><dt>Published</dt><dd>{draft.publishedDate ?? '—'}</dd></div>
                </>
              )}
            </dl>
          )}

          {!editingMeta && !music && (
            <label className={`field pages-field ${draft.pageCount ? '' : 'missing'}`}>
              <span>Pages</span>
              <input id="f-pages-edit" type="number" min={1} max={20000} value={draft.pageCount ?? ''} placeholder="Type the page count"
                onChange={(e) => set('pageCount', e.target.value ? Number(e.target.value) : undefined)} />
              {!book.pageCount && <span className="hint">The book databases didn't have a page count for this edition. You'll find it on the last numbered page.</span>}
            </label>
          )}

          <h3 className="section-label">Your copy</h3>
          {!isNew && (
            <label className="check own-check">
              <input id="f-owned" type="checkbox" checked={draft.owned !== false}
                onChange={(e) => setDraft((d) => ({ ...d, owned: e.target.checked ? undefined : false, wishlist: e.target.checked ? undefined : d.wishlist }))} />{' '}
              I own this {noun}
              {draft.owned === false && <span className="hint"> It's kept with your reading history but stays off your shelves and out of library counts.</span>}
            </label>
          )}
          {!isNew && draft.owned === false && (
            <label className="check own-check">
              <input id="f-wishlist" type="checkbox" checked={!!draft.wishlist} onChange={(e) => set('wishlist', e.target.checked || undefined)} />{' '}
              On my wishlist (I'd like to buy it)
            </label>
          )}
          <div className="grid-2">
            {kind === 'book' && (
              <label className="field">
                <span>Format</span>
                <select id="f-format" value={draft.format} onChange={(e) => set('format', e.target.value as BookFormat)}>
                  {Object.entries(FORMAT_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            )}
            {kind === 'vinyl' && (
              <label className="field">
                <span>Record size</span>
                <select id="f-vinyl-size" value={draft.vinylSize ?? 12} onChange={(e) => set('vinylSize', Number(e.target.value) as VinylSize)}>
                  <option value={12}>12-inch LP</option>
                  <option value={10}>10-inch</option>
                  <option value={7}>7-inch single</option>
                </select>
              </label>
            )}
            {music && (
              <label className="field">
                <span>{kind === 'vinyl' ? 'Records in the sleeve' : 'Discs'}</span>
                <input id="f-discs" type="number" min={1} max={50} value={draft.discCount ?? 1}
                  onChange={(e) => set('discCount', Math.max(1, Number(e.target.value) || 1))} />
              </label>
            )}
            <label className="field">
              <span>Copies</span>
              <input id="f-copies" type="number" min={1} value={draft.copies} onChange={(e) => set('copies', Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="field">
              <span>Bought on</span>
              <input id="f-acquired" type="date" value={draft.acquiredOn ?? ''} onChange={(e) => set('acquiredOn', e.target.value || undefined)} />
            </label>
            <div className="field">
              <span>Price paid</span>
              <div className="price-row">
                <select id="f-currency" aria-label="Currency" value={draft.currency ?? defaultCurrency}
                  onChange={(e) => {
                    set('currency', e.target.value);
                    onCurrencyChange(e.target.value);
                  }}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input id="f-price" type="number" min={0} step="0.01" aria-label="Amount" value={draft.pricePaid ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : undefined;
                    setDraft((d) => ({ ...d, pricePaid: v, currency: d.currency ?? defaultCurrency }));
                  }} />
              </div>
            </div>
            {music && !isNew && (
              <div className="field span-2">
                <span>Worth</span>
                <div className="worth-row">
                  <input id="f-worth" type="number" min={0} step="0.01" aria-label="Your own estimate of what it's worth"
                    placeholder="Your own estimate (optional)" value={draft.myValue ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, myValue: e.target.value ? Number(e.target.value) : undefined, currency: d.currency ?? defaultCurrency }))} />
                  <span className="muted small">
                    {marketLine(draft, draft.currency ?? defaultCurrency)}
                    {draft.discogsId && (
                      <>
                        {' '}
                        <a href={discogsReleaseUrl(draft.discogsId)} target="_blank" rel="noreferrer">Open on Discogs</a>
                      </>
                    )}
                  </span>
                </div>
              </div>
            )}
            <div className="field span-2 placement">
              <span>Where it lives</span>
              <div className="placement-row">
                <select id="f-bookcase" aria-label="Bookcase" value={place?.bookcaseId ?? ''}
                  onChange={(e) => setSpot(e.target.value, 1, 1)}>
                  <option value="">Not on a bookcase</option>
                  {bookcases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {place && bc && (
                  <>
                    <select id="f-shelf" aria-label={bc.sections > 1 ? 'Row' : 'Shelf'} value={place.shelf}
                      onChange={(e) => setSpot(bc.id, Number(e.target.value), Number(e.target.value) === 0 ? 1 : place.section)}>
                      <option value={0}>On top of the bookcase</option>
                      {Array.from({ length: bc.shelves }, (_, i) => (
                        <option key={i} value={i + 1}>{bc.sections > 1 ? `Row ${i + 1}` : `Shelf ${i + 1}`}{i === 0 ? ' (top)' : ''}</option>
                      ))}
                    </select>
                    {bc.sections > 1 && place.shelf > 0 && (
                      <select id="f-section" aria-label="Cube" value={place.section}
                        onChange={(e) => setSpot(bc.id, place.shelf, Number(e.target.value))}>
                        {Array.from({ length: bc.sections }, (_, i) => <option key={i} value={i + 1}>Cube {i + 1}</option>)}
                      </select>
                    )}
                    <select id="f-position" aria-label="Book number on the shelf" value={Math.min(place.position, slotCount)}
                      onChange={(e) => set('placement', { ...place, position: Number(e.target.value) })}>
                      {Array.from({ length: slotCount }, (_, i) => (
                        <option key={i} value={i + 1}>Book {i + 1}{(i === 0) ? ' (left)' : null}
                        {!(i === 0) && (i === slotCount - 1 && slotCount > 1) ? ' (right)' : null}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              {bookcases.length === 0 && <span className="hint">Add your bookcases in the Shelves tab to place books on them.</span>}
              {place && bc && !isNew && onShowOnShelf && sameSpot(book.placement, place) && (
                <button type="button" className="link hint-link" onClick={() => onShowOnShelf(book)}>
                  Show on {bc.name}, {spotName(bc, place).toLowerCase()}
                </button>
              )}
            </div>
            <div className="field span-2">
              <span>Spine photo</span>
              <div className="spine-photo-row">
                {draft.spineImage ? (
                  <img className="spine-photo-preview" src={draft.spineImage} alt="Your spine" />
                ) : (
                  <span className="hint">Shelves show the spine in the cover's colors. For the real thing, add a photo of the spine.</span>
                )}
                <label className="btn ghost file-btn">
                  {draft.spineImage ? 'Replace photo' : 'Add a photo'}
                  <input
                    id="f-spine"
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      try {
                        set('spineImage', await spinePhotoToDataUrl(f));
                        setError('');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Couldn't read that photo.");
                      }
                    }}
                  />
                </label>
                {draft.spineImage && (
                  <button type="button" className="link" onClick={() => set('spineImage', undefined)}>Remove</button>
                )}
              </div>
            </div>
            <label className="field span-2">
              <span>Location note</span>
              <input id="f-location" value={draft.location ?? ''} onChange={(e) => set('location', e.target.value || undefined)} placeholder="Optional, e.g. box in the attic, on the nightstand" />
            </label>
            <label className="field span-2">
              <span>Tags, separated by commas</span>
              <input id="f-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="signed, special edition, gift" />
            </label>
            {draft.loan?.loanId ? (
              <div className="field span-2 drawer-loan">
                <span>Lent to</span>
                <p>
                  <strong>{draft.loan.to}</strong> since {draft.loan.since}
                  {draft.loan.due ? `, back by ${draft.loan.due}` : ''}. Lent through Stacks, so they see it too.{' '}
                  <button type="button" className="link small" onClick={() => set('loan', undefined)}>Got it back</button>
                </p>
              </div>
            ) : (
              <>
            <label className="field">
              <span>Lent to</span>
              <input id="f-loan-to" value={draft.loan?.to ?? ''} placeholder="Nobody"
                onChange={(e) => set('loan', e.target.value ? { to: e.target.value, since: draft.loan?.since ?? new Date().toISOString().slice(0, 10) } : undefined)} />
            </label>
            <label className="field">
              <span>Lent on</span>
              <input id="f-loan-since" type="date" value={draft.loan?.since ?? ''} disabled={!draft.loan}
                onChange={(e) => draft.loan && set('loan', { ...draft.loan, since: e.target.value })} />
            </label>
              </>
            )}
            <label className="field span-2">
              <span>Notes</span>
              <textarea id="f-notes" rows={3} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} />
            </label>
          </div>

          {!editingMeta && draft.description && (
            <>
              <h3 className="section-label">About this book</h3>
              <p className="description">{draft.description.replace(/<[^>]+>/g, '')}</p>
            </>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <footer className="drawer-foot">
            {!isNew && onDelete && (
              confirmDelete ? (
                <span className="confirm">
                  Remove from your library?{' '}
                  <button type="button" className="btn danger" onClick={() => onDelete(book.id)}>Remove</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>Remove</button>
              )
            )}
            {!isNew && onRefresh && draft.isbn13 && (
              <button type="button" className="btn ghost" onClick={() => onRefresh(draft)}>Refresh details</button>
            )}
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary">{isNew ? `Add ${noun} to library` : 'Save'}</button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
