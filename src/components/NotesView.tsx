import { useMemo, useState } from 'react';
import type { Book, BookNote } from '../types';
import { Cover } from './Cover';
import { NoteCard, NoteEditor } from './NotesPanel';

interface Props {
  books: Book[];
  notes: BookNote[];
  onOpen: (b: Book) => void;
  onSave: (n: BookNote) => void;
  onRemove: (id: string) => void;
}

type Show = 'all' | 'quote' | 'note' | 'favorite';

/** Every quote and note across your books, on its own Reading page. */
export function NotesView({ books, notes, onOpen, onSave, onRemove }: Props) {
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const [show, setShow] = useState<Show>('all');
  const [query, setQuery] = useState('');
  const [bookFilter, setBookFilter] = useState('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Math.random());

  const mine = notes.filter((n) => byId.has(n.bookId));
  const quotes = mine.filter((n) => n.kind === 'quote');
  // A different favorite (or any quote) each visit, or on "Another".
  const spotlightPool = quotes.filter((n) => n.favorite).length ? quotes.filter((n) => n.favorite) : quotes;
  const spotlight = spotlightPool.length ? spotlightPool[Math.floor(seed * spotlightPool.length) % spotlightPool.length] : undefined;

  const q = query.trim().toLowerCase();
  const shown = mine
    .filter((n) => show === 'all' || (show === 'favorite' ? n.favorite : n.kind === show))
    .filter((n) => bookFilter === 'all' || n.bookId === bookFilter)
    .filter((n) => {
      if (!q) return true;
      const b = byId.get(n.bookId)!;
      return n.text.toLowerCase().includes(q) || b.title.toLowerCase().includes(q) || b.authors.some((a) => a.toLowerCase().includes(q));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const booksWithNotes = [...new Set(mine.map((n) => n.bookId))].map((id) => byId.get(id)!).sort((a, b) => a.title.localeCompare(b.title));

  if (mine.length === 0) {
    return (
      <div className="reading-view">
        <section className="panel">
          <h3>Quotes and notes</h3>
          <p className="muted">Open any book and use “Quotes and notes” to save lines you love and your own thoughts. They all collect here, searchable.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="reading-view">
      {spotlight && (
        <section className="panel spotlight">
          <div className="finished-head">
            <h3>{spotlight.favorite ? 'From your favorites' : 'A quote you saved'}</h3>
            {spotlightPool.length > 1 && <button className="link" onClick={() => setSeed(Math.random())}>Another</button>}
          </div>
          <blockquote>{spotlight.text}</blockquote>
          <button className="link spotlight-src" onClick={() => onOpen(byId.get(spotlight.bookId)!)}>
            {byId.get(spotlight.bookId)!.title}
            {byId.get(spotlight.bookId)!.authors[0] ? `, ${byId.get(spotlight.bookId)!.authors[0]}` : ''}
            {spotlight.page ? ` · p. ${spotlight.page}` : ''}
          </button>
        </section>
      )}

      <section className="panel">
        <div className="notes-tools">
          <input type="search" className="search" placeholder="Search quotes, notes, titles or authors" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search quotes and notes" />
          <select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show">
            <option value="all">Quotes and notes ({mine.length})</option>
            <option value="quote">Quotes ({quotes.length})</option>
            <option value="note">My notes ({mine.length - quotes.length})</option>
            <option value="favorite">Favorites ({mine.filter((n) => n.favorite).length})</option>
          </select>
          <select value={bookFilter} onChange={(e) => setBookFilter(e.target.value)} aria-label="Book">
            <option value="all">All books</option>
            {booksWithNotes.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </div>
        {shown.length === 0 ? (
          <p className="muted">Nothing matches.</p>
        ) : (
          <ul className="note-list wide">
            {shown.map((n) => {
              const b = byId.get(n.bookId)!;
              return editing === n.id ? (
                <li key={n.id}>
                  <NoteEditor
                    initial={n}
                    bookId={n.bookId}
                    pageCount={b.pageCount}
                    onSave={(x) => {
                      onSave(x);
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <NoteCard key={n.id} note={n} onSave={onSave} onRemove={onRemove} onEdit={() => setEditing(n.id)}>
                  <button className="note-book" onClick={() => onOpen(b)}>
                    <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" />
                    <span>{b.title}</span>
                  </button>
                </NoteCard>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
