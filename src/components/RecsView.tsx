import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Book, Reading } from '../types';
import { Cover } from './Cover';
import { currentReading } from '../lib/reading';
import { loadFeed, type FeedEntry } from '../lib/feed';
import { countOf } from '../lib/labels';
import {
  cachedShelves,
  cacheShelves,
  fromFriends,
  fromOpenLibrary,
  fromShelves,
  alreadyHave,
  hiddenRecs,
  hideRec,
  recKey,
  tasteId,
  tasteOf,
  unhideAll,
  type Rec,
  type Shelf,
} from '../lib/recommend';

/** Everything the recommendation pages show, worked out once. */
export function useRecs(books: Book[], readings: Reading[], uid?: string, social = false) {
  const [hidden, setHidden] = useState(hiddenRecs);
  const taste = useMemo(() => tasteOf(books, readings), [books, readings]);
  const id = tasteId(taste);
  const [remote, setRemote] = useState<Shelf[] | undefined>(() => cachedShelves(id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  const fetchRemote = useCallback(
    (force = false) => {
      if (!taste.loved.length) return setRemote([]);
      const c = !force && cachedShelves(id);
      if (c) return setRemote(c);
      setLoading(true);
      fromOpenLibrary(books, taste, hiddenRecs())
        .then(
          (s) => {
            cacheShelves(id, s);
            setRemote(s);
            setError(undefined);
          },
          (e) => setError((e as Error).message),
        )
        .finally(() => setLoading(false));
    },
    // Only refetch when your taste changes, not on every library edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  useEffect(() => fetchRemote(), [fetchRemote]);
  useEffect(() => {
    if (!uid || !social) return;
    loadFeed().then(setFeed, () => undefined);
  }, [uid, social]);

  const have = useMemo(() => new Set(books.map((b) => recKey(b.title, b.authors[0]))), [books]);
  const shelf = useMemo(() => fromShelves(books, readings, taste, hidden), [books, readings, taste, hidden]);
  const shelves = useMemo(
    () =>
      (remote ?? [])
        .map((s) => ({ ...s, recs: s.recs.filter((r) => !have.has(r.key) && !hidden.has(r.key) && !alreadyHave(books, r.title, r.authors[0])) }))
        .filter((s) => s.recs.length),
    [remote, have, hidden, books],
  );
  const friends = useMemo(() => (uid ? fromFriends(feed, books, uid, hidden) : []), [feed, books, uid, hidden]);

  return {
    taste,
    shelf,
    shelves,
    friends,
    loading: loading || remote === undefined,
    error,
    hiddenCount: hidden.size,
    refresh: () => fetchRemote(true),
    hide: (r: Rec) => {
      hideRec(r.key);
      setHidden(hiddenRecs());
    },
    unhide: () => {
      unhideAll();
      setHidden(new Set());
    },
  };
}

interface Actions {
  onOpen: (b: Book) => void;
  /** Put it on your to-read list (adds the book to Stacks if it's new). */
  onWant: (r: Rec) => void;
  /** Add a new book to your wishlist, to buy. */
  onWish: (r: Rec) => void;
  /** You read it already: log it, so it stops being suggested. */
  onRead?: (r: Rec) => void;
  onHide: (r: Rec) => void;
}

function RecCard({ r, books, readings, onOpen, onWant, onWish, onRead, onHide }: Readonly<{ r: Rec; books: Book[]; readings: Reading[] } & Actions>) {
  const local = r.bookId ? books.find((b) => b.id === r.bookId) : undefined;
  const queued = local && currentReading(readings, local.id)?.status === 'want';
  const by = r.authors.slice(0, 2).join(', ');
  return (
    <li className="rec">
      <button className="rec-cover" onClick={() => (local ? onOpen(local) : onWant(r))} title={local ? `Open ${r.title}` : `Want to read ${r.title}`}>
        <Cover url={r.cover} title={r.title} author={r.authors[0]} size="sm" />
      </button>
      <div className="rec-body">
        {local ? (
          <button className="link-plain rec-title" onClick={() => onOpen(local)}>{r.title}</button>
        ) : null}
        {!local && r.openLibraryKey ? (
          <a className="rec-title" href={`https://openlibrary.org${r.openLibraryKey}`} target="_blank" rel="noreferrer">{r.title}</a>
        ) : null}
        {!local && !r.openLibraryKey ? <strong className="rec-title">{r.title}</strong> : null}
        {by && <span className="muted small">{by}{r.year ? ` · ${r.year}` : ''}</span>}
        <span className="rec-why small">{r.reason}</span>
        <span className="rec-actions">
          {local && queued && <span className="muted small">On your to-read list</span>}
          {local && !queued && <button className="btn small-btn" onClick={() => onWant(r)}>Want to read</button>}
          {!local && (
            <>
              <button className="btn small-btn" onClick={() => onWant(r)}>Want to read</button>
              <button className="link small" onClick={() => onWish(r)}>Wishlist</button>
            </>
          )}
          {onRead && <button className="link small" onClick={() => onRead(r)}>Already read</button>}
          <button className="icon-btn rec-hide" onClick={() => onHide(r)} aria-label={`Not for me: ${r.title}`} title="Not for me">✕</button>
        </span>
      </div>
    </li>
  );
}

interface Props extends Omit<Actions, 'onHide'> {
  books: Book[];
  readings: Reading[];
  uid?: string;
  social: boolean;
  onFindFriends: () => void;
}

export function RecsView(props: Readonly<Props>) {
  const { books, readings, uid, social } = props;
  const recs = useRecs(books, readings, uid, social);
  const actions: Actions = { onOpen: props.onOpen, onWant: props.onWant, onWish: props.onWish, onRead: props.onRead, onHide: recs.hide };
  const row = (list: Rec[]) => (
    <ul className="recs">
      {list.map((r) => (
        <RecCard key={r.key} r={r} books={books} readings={readings} {...actions} />
      ))}
    </ul>
  );
  const noTaste = !recs.taste.loved.length;

  return (
    <div className="recs-page">
      <p className="muted recs-intro">
        {noTaste
          ? 'Rate the books you finish (4 stars and up counts as loved) and Stacks learns what you like. Until then, here are unread books from your shelves.'
          : `Picked from the ${recs.taste.loved.length === 1 ? 'book' : countOf(recs.taste.loved.length, 'book')} you loved, their genres and moods, and what your friends rated highly.`}
      </p>

      <section className="panel">
        <div className="home-head">
          <h3>From your own shelves</h3>
          <span className="muted small">Books you already own and haven't read</span>
        </div>
        {recs.shelf.length ? row(recs.shelf.slice(0, 8)) : <p className="muted">Every book on your shelves is read or on the go. Nice.</p>}
      </section>

      {recs.shelves.map((s) => (
        <section className="panel" key={s.id}>
          <div className="home-head">
            <h3>{s.title}</h3>
          </div>
          {row(s.recs)}
        </section>
      ))}
      {!noTaste && recs.loading && !recs.shelves.length && <p className="muted">Looking for new books on Open Library…</p>}
      {recs.error && <p className="account-error">{recs.error}</p>}

      {social ? (
        recs.friends.length > 0 && (
          <section className="panel">
            <div className="home-head">
              <h3>Your friends loved</h3>
            </div>
            {row(recs.friends)}
          </section>
        )
      ) : (
        <p className="muted small">
          <button className="link small" onClick={props.onFindFriends}>Add friends</button> to also see the books they rated highly.
        </p>
      )}

      <p className="recs-foot muted small">
        {!noTaste && (
          <button className="link small" onClick={recs.refresh} disabled={recs.loading}>{recs.loading ? 'Looking…' : 'Find new ones'}</button>
        )}
        {recs.hiddenCount > 0 && (
          <button className="link small" onClick={recs.unhide}>Show the {recs.hiddenCount} you hid again</button>
        )}
        <span>New books come from Open Library.</span>
      </p>
    </div>
  );
}

/** The Home card: a few picks, mixed from your shelves and new books. */
export function HomeRecs({ books, readings, uid, social, onOpen, onAll }: Readonly<{ books: Book[]; readings: Reading[]; uid?: string; social: boolean; onOpen: (b: Book) => void; onAll: () => void }>) {
  const recs = useRecs(books, readings, uid, social);
  const picks: Rec[] = [];
  // Books already on your to-read list are in "Up next" right above.
  const shelf = recs.shelf.filter((r) => !(r.bookId && currentReading(readings, r.bookId)?.status === 'want'));
  const pools = [shelf, ...recs.shelves.map((s) => s.recs), recs.friends];
  for (let i = 0; picks.length < 4 && i < 4; i++) for (const p of pools) if (p[i] && picks.length < 4 && !picks.some((x) => x.key === p[i].key)) picks.push(p[i]);
  return (
    <section className="panel">
      <div className="home-head">
        <h3>Picked for you</h3>
        <button className="link small" onClick={onAll}>More</button>
      </div>
      {picks.length ? (
        <ol className="home-covers">
          {picks.map((r) => {
            const local = r.bookId ? books.find((b) => b.id === r.bookId) : undefined;
            return (
              <li key={r.key}>
                <button onClick={() => (local ? onOpen(local) : onAll())} title={`${r.title}: ${r.reason}`}>
                  <Cover url={r.cover} title={r.title} author={r.authors[0]} size="sm" />
                  <span className="home-cover-title">{r.title}</span>
                  <span className="muted small home-cover-why">{r.reason}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">{recs.loading ? 'Finding books for you…' : null}
        {!recs.loading && (recs.error && recs.taste.loved.length) ? recs.error : null}
        {!recs.loading && !(recs.error && recs.taste.loved.length) ? 'Rate a few books you finished and Stacks suggests what to read next.' : null}</p>
      )}
    </section>
  );
}
