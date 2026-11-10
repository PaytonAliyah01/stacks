import { useEffect, useMemo, useState } from 'react';
import { Cover } from './Cover';
import { Avatar } from './ProfileEditor';
import { ShelvesView } from './ShelvesView';
import { asBook, fetchSharedShelf, type SharedItem, type SharedShelf as Shelf } from '../lib/share';

type Tab = 'books' | 'music' | 'wishlist';
const stars = (r: number) => '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');

/** What anyone with your shelf link sees. No account needed. */
export function SharedShelf({ token }: { token: string }) {
  const [shelf, setShelf] = useState<Shelf | null>();
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>('books');
  const [view, setView] = useState<'covers' | 'shelves'>('covers');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(60);
  const [open, setOpen] = useState<SharedItem>();

  useEffect(() => {
    fetchSharedShelf(token).then(
      (s) => {
        setShelf(s);
        if (s) {
          setTab(s.show.books ? 'books' : s.show.music ? 'music' : 'wishlist');
          if (s.show.shelves && s.bookcases.length) setView('shelves');
          document.title = `${s.title || `${s.name}’s shelves`} · Stacks`;
        }
      },
      (e) => setError((e as Error).message),
    );
  }, [token]);

  const lists = useMemo(() => {
    const items = shelf?.items ?? [];
    return {
      books: items.filter((x) => !x.wanted && x.kind === 'book'),
      music: items.filter((x) => !x.wanted && x.kind !== 'book'),
      wishlist: items.filter((x) => x.wanted),
    };
  }, [shelf]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(undefined);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);

  const home = location.pathname;
  const frame = (body: React.ReactNode) => (
    <div className="shared-page">
      <header className="shared-top">
        <a className="brand" href={home} aria-label="Stacks">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="brand-name">Stacks</span>
        </a>
        <a className="btn ghost" href={home}>Make your own library</a>
      </header>
      <main className="shared-main">{body}</main>
    </div>
  );

  if (error) return frame(<p className="shared-msg">Couldn't open this shelf: {error}</p>);
  if (shelf === undefined) return frame(<p className="shared-msg muted">Opening the shelves…</p>);
  if (shelf === null)
    return frame(
      <div className="shared-msg">
        <h2>This link doesn't work any more</h2>
        <p className="muted">Its owner turned it off or made a new one. Ask them for the new link.</p>
      </div>,
    );

  const tabs = (
    [
      ['books', 'Books', shelf.show.books],
      ['music', 'Records and CDs', shelf.show.music],
      ['wishlist', 'Wishlist', shelf.show.wishlist],
    ] as const
  ).filter(([k, , on]) => on && (lists[k].length > 0 || k !== 'music'));
  const list = lists[tab];
  const needle = q.trim().toLowerCase();
  const hits = needle ? list.filter((x) => `${x.title} ${(x.authors ?? []).join(' ')} ${x.series?.name ?? ''}`.toLowerCase().includes(needle)) : list;
  // Only the bookcases holding something from this tab.
  const cases = shelf.bookcases.filter((bc) => list.some((x) => x.placement?.bookcaseId === bc.id));
  const shelvesOk = shelf.show.shelves && cases.length > 0 && tab !== 'wishlist';
  const onShelves = shelvesOk && view === 'shelves' && !needle;
  const counts = [
    lists.books.length && `${lists.books.length.toLocaleString()} ${lists.books.length === 1 ? 'book' : 'books'}`,
    lists.music.length && `${lists.music.length.toLocaleString()} ${lists.music.length === 1 ? 'record or CD' : 'records and CDs'}`,
  ].filter(Boolean);

  return frame(
    <>
      <section className="shared-hero">
        <Avatar p={{ avatar_url: shelf.avatar_url, avatar_color: shelf.avatar_color ?? '#1f5c45', display_name: shelf.name, username: shelf.name }} size={56} />
        <div>
          <h1>{shelf.title || `${shelf.name}’s shelves`}</h1>
          <p className="muted">{counts.length ? counts.join(' · ') : 'Nothing here yet.'}</p>
        </div>
      </section>

      {tabs.length > 1 && (
        <nav className="subtabs" aria-label="What to show">
          {tabs.map(([k, l]) => (
            <button key={k} className={tab === k ? 'active' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => { setTab(k); setShown(60); }}>
              {l} <span className="muted small">{lists[k].length}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="shared-tools">
        <input className="search" type="search" placeholder={tab === 'music' ? 'Search records and CDs' : 'Search titles, authors, series'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        {shelvesOk && (
          <div className="seg" role="group" aria-label="Show as">
            <button className={view === 'shelves' ? 'active' : ''} aria-pressed={view === 'shelves'} onClick={() => setView('shelves')}>On the bookcases</button>
            <button className={view === 'covers' ? 'active' : ''} aria-pressed={view === 'covers'} onClick={() => setView('covers')}>Covers</button>
          </div>
        )}
      </div>

      {onShelves ? (
        <ShelvesView readOnly books={list.map(asBook)} bookcases={cases} onOpenBook={(b) => setOpen(list.find((x) => x.id === b.id))} />
      ) : hits.length === 0 ? (
        <p className="shared-msg muted">{needle ? `Nothing matches “${q.trim()}”.` : 'Nothing here yet.'}</p>
      ) : (
        <>
          <ul className="grid shared-grid">
            {hits.slice(0, shown).map((x) => (
              <li key={x.id}>
                <button className="book" onClick={() => setOpen(x)}>
                  <span className="book-cover">
                    <Cover url={x.cover} title={x.title} author={x.authors?.[0]} square={x.kind !== 'book'} />
                  </span>
                  <span className="book-title">{x.title}</span>
                  {x.authors?.[0] && <span className="book-author">{x.authors.join(', ')}</span>}
                  {x.rating ? <span className="wrap-stars small" aria-label={`${x.rating} stars`}>{stars(x.rating)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {hits.length > shown && (
            <button className="btn ghost shared-more" onClick={() => setShown((n) => n + 120)}>
              Show more ({(hits.length - shown).toLocaleString()} left)
            </button>
          )}
        </>
      )}

      {open && (
        <div className="shared-overlay" onClick={() => setOpen(undefined)} onKeyDown={(e) => e.key === 'Escape' && setOpen(undefined)}>
          <div className="shared-card" role="dialog" aria-label={open.title} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Cover url={open.cover} title={open.title} author={open.authors?.[0]} size="lg" square={open.kind !== 'book'} />
            <div className="shared-card-body">
              <h2>{open.title}</h2>
              {open.authors?.length ? <p>{open.authors.join(', ')}</p> : null}
              <p className="muted small">
                {[open.kind === 'vinyl' ? 'Vinyl' : open.kind === 'cd' ? 'CD' : null, open.year, open.pages && open.kind === 'book' ? `${open.pages} pages` : null, open.series ? `${open.series.name}${open.series.number != null ? ` #${open.series.number}` : ''}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {open.rating ? <p className="wrap-stars">{stars(open.rating)} <span className="muted small">{shelf.name}’s rating</span></p> : null}
              {open.wanted && <p className="small">On {shelf.name}’s wishlist.</p>}
              <button className="btn ghost" onClick={() => setOpen(undefined)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>,
  );
}
