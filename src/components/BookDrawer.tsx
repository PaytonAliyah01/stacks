import { useEffect, useState } from 'react';
import { FORMAT_LABELS, KIND_LABELS, isMusic, kindOf, type Book, type BookFormat, type Bookcase, type BookNote, type Reading, type Spin, type VinylSize } from '../types';
import { SpinsPanel } from './SpinsPanel';
import { PressingPanel } from './PressingPanel';
import { TracksPanel } from './TracksPanel';
import { ReadingPanel } from './ReadingPanel';
import { MoodPanel } from './MoodPanel';
import { NotesPanel } from './NotesPanel';
import { SeriesField } from './SeriesField';
import { Cover } from './Cover';
import { stripTags } from '../lib/text';
import { DrawerFoot, DrawerTitle, IdentityFields, LoanFields, OwnershipChecks, PlacementField, PriceField, SpinePhotoField, WorthField } from './BookDrawerParts';
import { identityFromInput } from '../lib/isbn';

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
      const id = identityFromInput(isbn, music);
      if ('error' in id) return setError(id.error);
      Object.assign(next, id.patch);
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
            <DrawerTitle draft={draft} kind={kind} music={music} isNew={isNew} noAuthors={!book.authors.length} authors={authors} setAuthors={setAuthors}
              editingMeta={editingMeta} onEditMeta={() => setEditingMeta(true)} set={set} setDraft={setDraft} />
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

          <IdentityFields draft={draft} music={music} editingMeta={editingMeta} isbn={isbn} setIsbn={setIsbn} set={set} />

          {!editingMeta && !music && (
            <label className={`field pages-field ${draft.pageCount ? '' : 'missing'}`}>
              <span>Pages</span>
              <input id="f-pages-edit" type="number" min={1} max={20000} value={draft.pageCount ?? ''} placeholder="Type the page count"
                onChange={(e) => set('pageCount', e.target.value ? Number(e.target.value) : undefined)} />
              {!book.pageCount && <span className="hint">The book databases didn't have a page count for this edition. You'll find it on the last numbered page.</span>}
            </label>
          )}

          <h3 className="section-label">Your copy</h3>
          {!isNew && <OwnershipChecks draft={draft} noun={noun} set={set} setDraft={setDraft} />}
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
            <PriceField draft={draft} defaultCurrency={defaultCurrency} onCurrencyChange={onCurrencyChange} set={set} setDraft={setDraft} />
            {music && !isNew && <WorthField draft={draft} defaultCurrency={defaultCurrency} setDraft={setDraft} />}
            <PlacementField book={book} draft={draft} books={books} bookcases={bookcases} isNew={isNew} onShowOnShelf={onShowOnShelf} set={set} />
            <SpinePhotoField draft={draft} set={set} setError={setError} />
            <label className="field span-2">
              <span>Location note</span>
              <input id="f-location" value={draft.location ?? ''} onChange={(e) => set('location', e.target.value || undefined)} placeholder="Optional, e.g. box in the attic, on the nightstand" />
            </label>
            <label className="field span-2">
              <span>Tags, separated by commas</span>
              <input id="f-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="signed, special edition, gift" />
            </label>
            <LoanFields draft={draft} set={set} />
            <label className="field span-2">
              <span>Notes</span>
              <textarea id="f-notes" rows={3} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} />
            </label>
          </div>

          {!editingMeta && draft.description && (
            <>
              <h3 className="section-label">About this book</h3>
              <p className="description">{stripTags(draft.description)}</p>
            </>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <DrawerFoot book={book} draft={draft} isNew={isNew} noun={noun} onDelete={onDelete} onRefresh={onRefresh} onClose={onClose}
            confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} />
        </form>
      </dialog>
    </div>
  );
}
