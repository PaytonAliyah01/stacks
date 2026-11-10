import { useEffect, useRef, useState } from 'react';
import { getGoogleKey, searchBooks, type SearchHit } from '../lib/lookup';
import { formatIsbn13 } from '../lib/isbn';
import { Cover } from './Cover';

interface Props {
  /** The scanned ISBN this search is for, if any. It is kept on the book you pick. */
  isbn13?: string;
  /** Searched for straight away when given. */
  initialQuery?: string;
  onPick: (hit: SearchHit) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

export function SearchDialog({ isbn13, initialQuery, onPick, onOpenSettings, onClose }: Readonly<Props>) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [problem, setProblem] = useState<string>();
  const [problemKind, setProblemKind] = useState<'quota' | 'server' | 'other'>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (initialQuery?.trim()) void run(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (text = query) => {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setProblem(undefined);
    const r = await searchBooks(q);
    setHits(r.hits);
    setProblem(r.problem);
    setProblemKind(r.problemKind);
    setBusy(false);
  };

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer narrow" role="dialog" aria-modal="true" aria-label="Search by title">
        <form
          className="drawer-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <header className="drawer-head">
            <h2 className="drawer-heading">Search by title</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </header>
          {isbn13 && (
            <p className="hint">
              The book you pick is saved with the ISBN you scanned, {formatIsbn13(isbn13)}, so scanning it again finds it.
            </p>
          )}
          <div className="search-row">
            <input
              ref={inputRef}
              data-scan-input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title, author or both"
              aria-label="Title or author"
            />
            <button className="btn primary" type="submit" disabled={busy || !query.trim()}>
              {busy ? 'Searching…' : 'Search'}
            </button>
          </div>
          {problem && (
            <p className="search-problem">
              {problem}{' '}
              {problemKind === 'server' ? (
                <span className="muted">That's Google having a hiccup, not your {getGoogleKey() ? 'key' : 'settings'}. Press Search again in a minute.</span>
              ) : problemKind === 'quota' && !getGoogleKey() ? (
                <button type="button" className="link" onClick={onOpenSettings}>Add a Google Books key</button>
              ) : problemKind === 'quota' ? (
                <button type="button" className="link" onClick={onOpenSettings}>Check your Google Books key</button>
              ) : null}
            </p>
          )}
          {hits?.length === 0 && !busy && <p className="muted">Nothing found. Try fewer words, or just the title.</p>}
          {hits && hits.length > 0 && (
            <ul className="search-hits">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="search-hit" onClick={() => onPick(h)}>
                    <Cover url={h.metadata.coverUrl} title={h.metadata.title ?? ''} author={h.metadata.authors?.[0]} size="sm" />
                    <span className="search-hit-text">
                      <strong>{h.metadata.title}</strong>
                      {h.metadata.authors?.length ? <span>{h.metadata.authors.join(', ')}</span> : null}
                      <span className="muted small">
                        {[h.metadata.publisher, h.metadata.publishedDate?.slice(0, 4), h.metadata.pageCount && `${h.metadata.pageCount} pages`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="muted small">{h.source === 'googlebooks' ? 'Google Books' : 'Open Library'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      </aside>
    </div>
  );
}
