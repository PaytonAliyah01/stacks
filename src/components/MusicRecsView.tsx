import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Book, Spin } from '../types';
import { Cover } from './Cover';
import { loadFeed, type FeedEntry } from '../lib/feed';
import { cachedShelves, cacheShelves, hiddenRecs, hideRec, unhideAll, type Rec, type Shelf } from '../lib/recommend';
import { friendsSpinning, fromCrates, fromDeezer, musicTasteId, musicTasteOf } from '../lib/musicrecs';

const CACHE = 'stacks.recs.music';

interface Props {
  records: Book[];
  spins: Spin[];
  uid?: string;
  social: boolean;
  onOpen: (b: Book) => void;
  onSpin: (b: Book) => void;
  /** Put a record you don't have on your wantlist. */
  onWant: (r: Rec) => void;
  onFindFriends: () => void;
}

export function MusicRecsView({ records, spins, uid, social, onOpen, onSpin, onWant, onFindFriends }: Readonly<Props>) {
  const [hidden, setHidden] = useState(hiddenRecs);
  const taste = useMemo(() => musicTasteOf(records, spins), [records, spins]);
  const id = musicTasteId(taste);
  const [remote, setRemote] = useState<Shelf[] | undefined>(() => cachedShelves(id, CACHE));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  const fetchRemote = useCallback(
    (force = false) => {
      if (!id) return setRemote([]);
      const c = !force && cachedShelves(id, CACHE);
      if (c) return setRemote(c);
      setLoading(true);
      fromDeezer(records, taste, hiddenRecs())
        .then(
          (s) => {
            cacheShelves(id, s, CACHE);
            setRemote(s);
            setError(undefined);
          },
          (e) => setError((e as Error).message),
        )
        .finally(() => setLoading(false));
    },
    // Only look again when your top artists change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  useEffect(() => fetchRemote(), [fetchRemote]);
  useEffect(() => {
    if (uid && social) loadFeed().then(setFeed, () => undefined);
  }, [uid, social]);

  const crates = useMemo(() => fromCrates(records, spins, taste, hidden), [records, spins, taste, hidden]);
  const have = useMemo(() => new Set(records.map((b) => `${b.title}|${b.authors[0]}`.toLowerCase())), [records]);
  const shelves = useMemo(
    () =>
      (remote ?? [])
        .map((s) => ({ ...s, recs: s.recs.filter((r) => !hidden.has(r.key) && !have.has(`${r.title}|${r.authors[0]}`.toLowerCase())) }))
        .filter((s) => s.recs.length),
    [remote, hidden, have],
  );
  const friends = useMemo(() => (uid ? friendsSpinning(feed, records, uid, hidden) : []), [feed, records, uid, hidden]);
  const hide = (r: Rec) => {
    hideRec(r.key);
    setHidden(hiddenRecs());
  };

  const card = (r: Rec) => {
    const local = r.bookId ? records.find((b) => b.id === r.bookId) : undefined;
    return (
      <li className="rec" key={r.key}>
        <button className="rec-cover" onClick={() => (local ? onOpen(local) : onWant(r))} title={local ? `Open ${r.title}` : `Add ${r.title} to your wantlist`}>
          <Cover url={r.cover} title={r.title} author={r.authors[0]} size="sm" square />
        </button>
        <div className="rec-body">
          {local ? (
            <button className="link-plain rec-title" onClick={() => onOpen(local)}>{r.title}</button>
          ) : r.link ? (
            <a className="rec-title" href={r.link} target="_blank" rel="noreferrer">{r.title}</a>
          ) : (
            <strong className="rec-title">{r.title}</strong>
          )}
          <span className="muted small">{r.authors[0]}{r.year ? ` · ${r.year}` : ''}</span>
          <span className="rec-why small">{r.reason}</span>
          <span className="rec-actions">
            {local ? (
              <button className="btn primary small-btn" onClick={() => onSpin(local)}>▶ Spin</button>
            ) : (
              <>
                <button className="btn small-btn" onClick={() => onWant(r)}>Add to wantlist</button>
                {r.link && <a className="link small" href={r.link} target="_blank" rel="noreferrer">Listen</a>}
              </>
            )}
            <button className="icon-btn rec-hide" onClick={() => hide(r)} aria-label={`Not for me: ${r.title}`} title="Not for me">✕</button>
          </span>
        </div>
      </li>
    );
  };
  const row = (list: Rec[]) => <ul className="recs">{list.map(card)}</ul>;

  if (!records.some((b) => b.owned !== false))
    return <p className="muted">Scan your records and CDs, log what you spin, and Stacks suggests what to put on and what to look for next.</p>;

  return (
    <div className="recs-page">
      <p className="muted recs-intro">
        {spins.length
          ? `Picked from the ${spins.length.toLocaleString()} spins you've logged, the artists and genres you play most, and what your friends put on.`
          : 'Press ▶ Spin when you put a record on and these picks get better. For now they come from what you own.'}
      </p>

      <section className="panel">
        <div className="home-head">
          <h3>Pull these out of your crates</h3>
          <span className="muted small">Records you own and haven't played in a while</span>
        </div>
        {crates.length ? row(crates) : <p className="muted">You've played everything lately. Impressive.</p>}
      </section>

      {shelves.map((s) => (
        <section className="panel" key={s.id}>
          <div className="home-head">
            <h3>{s.title}</h3>
          </div>
          {row(s.recs)}
        </section>
      ))}
      {loading && !shelves.length && <p className="muted">Looking for new music on Deezer…</p>}
      {error && <p className="account-error">{error}</p>}

      {social ? (
        friends.length > 0 && (
          <section className="panel">
            <div className="home-head">
              <h3>Your friends are spinning</h3>
            </div>
            {row(friends)}
          </section>
        )
      ) : (
        <p className="muted small">
          <button className="link small" onClick={onFindFriends}>Add friends</button> to also see what they're spinning.
        </p>
      )}

      <p className="recs-foot muted small">
        {id && <button className="link small" onClick={() => fetchRemote(true)} disabled={loading}>{loading ? 'Looking…' : 'Find new ones'}</button>}
        {hidden.size > 0 && (
          <button
            className="link small"
            onClick={() => {
              unhideAll();
              setHidden(new Set());
            }}
          >
            Show the {hidden.size} you hid again
          </button>
        )}
        <span>New albums and similar artists come from Deezer.</span>
      </p>
    </div>
  );
}
