import { CURRENCIES, KIND_LABELS, type Book, type Bookcase, type ItemKind } from '../types';
import { discogsReleaseUrl, marketLine } from '../lib/value';
import { booksAt, sameSpot, spotName } from '../lib/shelving';
import { formatIsbn13 } from '../lib/isbn';
import { spinePhotoToDataUrl } from '../lib/coverColor';
import { focusOnMount } from '../lib/focus';

// Pieces of the book and record drawer, split out so each stays easy to follow.

export type SetField = <K extends keyof Book>(k: K, v: Book[K]) => void;
type SetDraft = (fn: (d: Book) => Book) => void;

interface TitleProps {
  draft: Book;
  kind: ItemKind;
  music: boolean;
  isNew?: boolean;
  /** The book had no authors when the drawer opened. */
  noAuthors: boolean;
  authors: string;
  setAuthors: (v: string) => void;
  editingMeta: boolean;
  onEditMeta: () => void;
  set: SetField;
  setDraft: SetDraft;
}

export function DrawerTitle({ draft, kind, music, isNew, noAuthors, authors, setAuthors, editingMeta, onEditMeta, set, setDraft }: Readonly<TitleProps>) {
  if (editingMeta)
    return (
      <div className="drawer-title">
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
          <input id="f-authors" value={authors} onChange={(e) => setAuthors(e.target.value)} ref={!isNew && noAuthors ? focusOnMount : undefined} />
        </label>
      </div>
    );
  return (
    <div className="drawer-title">
      <h2>{draft.title}</h2>
      {draft.subtitle && <p className="subtitle">{draft.subtitle}</p>}
      {draft.authors.length ? (
        <p className="byline">{draft.authors.join(', ')}</p>
      ) : (
        <button type="button" className="link byline-add" onClick={onEditMeta}>
          {music ? '+ Add the artist' : '+ Add the author'}
        </button>
      )}
      <button type="button" className="link edit-details" onClick={onEditMeta}>
        Edit title, {music ? 'artist' : 'author'} and details
      </button>
    </div>
  );
}

interface IdentityProps {
  draft: Book;
  music: boolean;
  editingMeta: boolean;
  isbn: string;
  setIsbn: (v: string) => void;
  set: SetField;
}

const numberOrNone = (v: string) => (v ? Number(v) : undefined);

export function IdentityFields({ draft, music, editingMeta, isbn, setIsbn, set }: Readonly<IdentityProps>) {
  if (editingMeta)
    return (
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
            <input id="f-tracks" type="number" min={1} value={draft.trackCount ?? ''} onChange={(e) => set('trackCount', numberOrNone(e.target.value))} />
          </label>
        ) : (
          <label className="field">
            <span>Pages</span>
            <input id="f-pages" type="number" min={1} value={draft.pageCount ?? ''} onChange={(e) => set('pageCount', numberOrNone(e.target.value))} />
          </label>
        )}
      </div>
    );
  return (
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
  );
}

interface OwnProps {
  draft: Book;
  noun: string;
  set: SetField;
  setDraft: SetDraft;
}

export function OwnershipChecks({ draft, noun, set, setDraft }: Readonly<OwnProps>) {
  const notOwned = draft.owned === false;
  return (
    <>
      <label className="check own-check">
        <input id="f-owned" type="checkbox" checked={!notOwned}
          onChange={(e) => setDraft((d) => ({ ...d, owned: e.target.checked ? undefined : false, wishlist: e.target.checked ? undefined : d.wishlist }))} />{' '}
        I own this {noun}
        {notOwned && <span className="hint"> It's kept with your reading history but stays off your shelves and out of library counts.</span>}
      </label>
      {notOwned && (
        <label className="check own-check">
          <input id="f-wishlist" type="checkbox" checked={!!draft.wishlist} onChange={(e) => set('wishlist', e.target.checked || undefined)} />{' '}
          On my wishlist (I'd like to buy it)
        </label>
      )}
    </>
  );
}

interface MoneyProps {
  draft: Book;
  defaultCurrency: string;
  onCurrencyChange: (code: string) => void;
  set: SetField;
  setDraft: SetDraft;
}

export function PriceField({ draft, defaultCurrency, onCurrencyChange, set, setDraft }: Readonly<MoneyProps>) {
  return (
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
            const v = numberOrNone(e.target.value);
            setDraft((d) => ({ ...d, pricePaid: v, currency: d.currency ?? defaultCurrency }));
          }} />
      </div>
    </div>
  );
}

export function WorthField({ draft, defaultCurrency, setDraft }: Readonly<Omit<MoneyProps, 'set' | 'onCurrencyChange'>>) {
  return (
    <div className="field span-2">
      <span>Worth</span>
      <div className="worth-row">
        <input id="f-worth" type="number" min={0} step="0.01" aria-label="Your own estimate of what it's worth"
          placeholder="Your own estimate (optional)" value={draft.myValue ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, myValue: numberOrNone(e.target.value), currency: d.currency ?? defaultCurrency }))} />
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
  );
}

interface PlaceProps {
  book: Book;
  draft: Book;
  books: Book[];
  bookcases: Bookcase[];
  isNew?: boolean;
  onShowOnShelf?: (book: Book) => void;
  set: SetField;
}

const positionLabel = (i: number, count: number) => {
  if (i === 0) return ' (left)';
  return i === count - 1 ? ' (right)' : '';
};

export function PlacementField({ book, draft, books, bookcases, isNew, onShowOnShelf, set }: Readonly<PlaceProps>) {
  const place = draft.placement;
  const bc = bookcases.find((c) => c.id === place?.bookcaseId);
  // How many spots the book could take in the chosen section (its own included).
  const slotCount = place && bc ? booksAt(books, place).filter((b) => b.id !== book.id).length + 1 : 1;
  const endOf = (spot: { bookcaseId: string; shelf: number; section: number }) => booksAt(books, spot).filter((b) => b.id !== book.id).length + 1;
  const setSpot = (bookcaseId: string, shelf: number, section: number) => {
    if (!bookcaseId) return set('placement', undefined);
    const spot = { bookcaseId, shelf, section };
    const keep = sameSpot(book.placement, spot) ? book.placement!.position : endOf(spot);
    set('placement', { ...spot, position: keep });
  };
  const canShow = place && bc && !isNew && onShowOnShelf && sameSpot(book.placement, place);
  return (
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
                <option key={i} value={i + 1}>Book {i + 1}{positionLabel(i, slotCount)}</option>
              ))}
            </select>
          </>
        )}
      </div>
      {bookcases.length === 0 && <span className="hint">Add your bookcases in the Shelves tab to place books on them.</span>}
      {canShow && (
        <button type="button" className="link hint-link" onClick={() => onShowOnShelf(book)}>
          Show on {bc.name}, {spotName(bc, place).toLowerCase()}
        </button>
      )}
    </div>
  );
}

export function SpinePhotoField({ draft, set, setError }: Readonly<{ draft: Book; set: SetField; setError: (e: string) => void }>) {
  return (
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
  );
}

export function LoanFields({ draft, set }: Readonly<{ draft: Book; set: SetField }>) {
  const loan = draft.loan;
  if (loan?.loanId)
    return (
      <div className="field span-2 drawer-loan">
        <span>Lent to</span>
        <p>
          <strong>{loan.to}</strong> since {loan.since}
          {loan.due ? `, back by ${loan.due}` : ''}. Lent through Stacks, so they see it too.{' '}
          <button type="button" className="link small" onClick={() => set('loan', undefined)}>Got it back</button>
        </p>
      </div>
    );
  return (
    <>
      <label className="field">
        <span>Lent to</span>
        <input id="f-loan-to" value={loan?.to ?? ''} placeholder="Nobody"
          onChange={(e) => set('loan', e.target.value ? { to: e.target.value, since: loan?.since ?? new Date().toISOString().slice(0, 10) } : undefined)} />
      </label>
      <label className="field">
        <span>Lent on</span>
        <input id="f-loan-since" type="date" value={loan?.since ?? ''} disabled={!loan}
          onChange={(e) => loan && set('loan', { ...loan, since: e.target.value })} />
      </label>
    </>
  );
}

interface FootProps {
  book: Book;
  draft: Book;
  isNew?: boolean;
  noun: string;
  onDelete?: (id: string) => void;
  onRefresh?: (book: Book) => void;
  onClose: () => void;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
}

export function DrawerFoot({ book, draft, isNew, noun, onDelete, onRefresh, onClose, confirmDelete, setConfirmDelete }: Readonly<FootProps>) {
  const canDelete = !isNew && onDelete;
  return (
    <footer className="drawer-foot">
      {canDelete && confirmDelete && (
        <span className="confirm">
          Remove from your library?{' '}
          <button type="button" className="btn danger" onClick={() => onDelete(book.id)}>Remove</button>
          <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
        </span>
      )}
      {canDelete && !confirmDelete && (
        <button type="button" className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>Remove</button>
      )}
      {!isNew && onRefresh && draft.isbn13 && (
        <button type="button" className="btn ghost" onClick={() => onRefresh(draft)}>Refresh details</button>
      )}
      <span className="spacer" />
      <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
      <button type="submit" className="btn primary">{isNew ? `Add ${noun} to library` : 'Save'}</button>
    </footer>
  );
}
