import { useEffect, useMemo, useState } from 'react';
import { Cover } from './Cover';
import { Avatar } from './ProfileEditor';
import { ShelvesView } from './ShelvesView';
import { asBook, fetchSharedShelf, type SharedItem, type SharedShelf as Shelf } from '../lib/share';
import { formatWord } from '../lib/labels';
import { seriesLabel } from '../lib/series';

type Tab = 'books' | 'music' | 'wishlist';
const stars = (r: number) => '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');

type Lists = Record<Tab, SharedItem[]>;

function SharedFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  const home = location.pathname;
  return (
    <div className="shared-page">
      <header className="shared-top">
        <a className="brand" href={home} aria-label="Stacks">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="brand-name">Stacks</span>
        </a>
        <a className="btn ghost" href={home}>Make your own library</a>
      </header>
      <main className="shared-main">{children}</main>
    </div>
  );
}

const countLine = (n: number, one: string, many: string) => n && `${n.toLocaleString()} ${n === 1 ? one : many}`;

function SharedHero({ shelf, lists }: Readonly<{ shelf: Shelf; lists: Lists }>) {
  const counts = [countLine(lists.books.length, 'book', 'books'), countLine(lists.music.length, 'record or CD', 'records and CDs')].filter(Boolean);
  return (
    <section className="shared-hero">
      <Avatar p={{ avatar_url: shelf.avatar_url, avatar_color: shelf.avatar_color ?? '#1f5c45', display_name: shelf.name, username: shelf.name }} size={56} />
      <div>
        <h1>{shelf.title || `${shelf.name}’s shelves`}</h1>
        <p className="muted">{counts.length ? counts.join(' · ') : 'Nothing here yet.'}</p>
      </div>
    </section>
  );
}

function SharedGrid({ hits, setOpen }: Readonly<{ hits: SharedItem[]; setOpen: (x: SharedItem) => void }>) {
  const [shown, setShown] = useState(60);
  return (
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
  );
}

function SharedCard({ open, owner, onClose }: Readonly<{ open: SharedItem; owner: string; onClose: () => void }>) {
  const facts = [
    formatWord(open.kind),
    open.year,
    open.pages && open.kind === 'book' ? `${open.pages} pages` : null,
    open.series ? seriesLabel({ name: open.series.name, number: open.series.number ?? undefined }) : null,
  ];
  return (
    <div className="shared-overlay">
      <button type="button" className="backdrop-close" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <dialog open className="shared-card" aria-label={open.title}>
        <Cover url={open.cover} title={open.title} author={open.authors?.[0]} size="lg" square={open.kind !== 'book'} />
        <div className="shared-card-body">
          <h2>{open.title}</h2>
          {open.authors?.length ? <p>{open.authors.join(', ')}</p> : null}
          <p className="muted small">{facts.filter(Boolean).join(' · ')}</p>
          {open.rating ? <p className="wrap-stars">{stars(open.rating)} <span className="muted small">{owner}’s rating</span></p> : null}
          {open.wanted && <p className="small">On {owner}’s wishlist.</p>}
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </dialog>
    </div>
  );
}

function SharedShelfPage({ shelf, lists, initialTab, initialView }: Readonly<{ shelf: Shelf; lists: Lists; initialTab: Tab; initialView: 'covers' | 'shelves' }>) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [view, setView] = useState(initialView);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<SharedItem>();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(undefined);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);

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

  const body = () => {
    if (onShelves) return <ShelvesView readOnly books={list.map(asBook)} bookcases={cases} onOpenBook={(b) => setOpen(list.find((x) => x.id === b.id))} />;
    if (hits.length === 0) return <p className="shared-msg muted">{needle ? `Nothing matches “${q.trim()}”.` : 'Nothing here yet.'}</p>;
    return <SharedGrid key={tab} hits={hits} setOpen={setOpen} />;
  };

  return (
    <>
      <SharedHero shelf={shelf} lists={lists} />

      {tabs.length > 1 && (
        <nav className="subtabs" aria-label="What to show">
          {tabs.map(([k, l]) => (
            <button key={k} className={tab === k ? 'active' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
              {l} <span className="muted small">{lists[k].length}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="shared-tools">
        <input className="search" type="search" placeholder={tab === 'music' ? 'Search records and CDs' : 'Search titles, authors, series'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        {shelvesOk && (
          <fieldset className="seg" aria-label="Show as">
            <button className={view === 'shelves' ? 'active' : ''} aria-pressed={view === 'shelves'} onClick={() => setView('shelves')}>On the bookcases</button>
            <button className={view === 'covers' ? 'active' : ''} aria-pressed={view === 'covers'} onClick={() => setView('covers')}>Covers</button>
          </fieldset>
        )}
      </div>

      {body()}

      {open && <SharedCard open={open} owner={shelf.name} onClose={() => setOpen(undefined)} />}
    </>
  );
}

/** What anyone with your shelf link sees. No account needed. */
export function SharedShelf({ token }: Readonly<{ token: string }>) {
  const [shelf, setShelf] = useState<Shelf | null>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetchSharedShelf(token).then(
      (s) => {
        setShelf(s);
        if (s) {
          const heading = s.title || `${s.name}’s shelves`;
          document.title = `${heading} · Stacks`;
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

  if (error) return <SharedFrame><p className="shared-msg">Couldn't open this shelf: {error}</p></SharedFrame>;
  if (shelf === undefined) return <SharedFrame><p className="shared-msg muted">Opening the shelves…</p></SharedFrame>;
  if (shelf === null) {
    return (
      <SharedFrame>
        <div className="shared-msg">
          <h2>This link doesn't work any more</h2>
          <p className="muted">Its owner turned it off or made a new one. Ask them for the new link.</p>
        </div>
      </SharedFrame>
    );
  }
  const firstTab: Tab = shelf.show.books ? 'books' : (shelf.show.music && 'music') || 'wishlist';
  const firstView = shelf.show.shelves && shelf.bookcases.length ? 'shelves' : 'covers';
  return (
    <SharedFrame>
      <SharedShelfPage shelf={shelf} lists={lists} initialTab={firstTab} initialView={firstView} />
    </SharedFrame>
  );
}
