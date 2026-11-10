import { useCallback, useEffect, useState } from 'react';
import { Cover } from './Cover';
import { formatIsbn13 } from '../lib/isbn';
import { claimGift, friendWishlist, getWishlistOpen, setWishlistOpen, unclaimGift, type WishItem } from '../lib/gifts';
import { formatWord } from '../lib/labels';

interface Props {
  uid: string;
  friendId: string;
  friendName: string;
  /** After you claim or unclaim something. */
  onChanged?: () => void;
  /** Show the heading (off when the page around it already says whose list this is). */
  heading?: boolean;
}

/** A friend's wishlist and wantlist, with "I'm getting this". */
export function FriendWishlist({ uid, friendId, friendName, onChanged, heading = true }: Readonly<Props>) {
  const [items, setItems] = useState<WishItem[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [kind, setKind] = useState<'books' | 'music'>('books');

  const load = useCallback(() => {
    friendWishlist(friendId).then(
      (l) => {
        setItems(l);
        setError(undefined);
      },
      (e) => setError((e as Error).message),
    );
  }, [friendId]);
  useEffect(() => {
    setItems(undefined);
    load();
  }, [load]);

  const act = async (w: WishItem, fn: () => Promise<void>) => {
    setBusy(w.id);
    try {
      await fn();
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(undefined);
    load();
    onChanged?.();
  };

  const books = items?.filter((w) => w.kind === 'book') ?? [];
  const music = items?.filter((w) => w.kind !== 'book') ?? [];
  // Start on whichever list has something.
  useEffect(() => {
    if (items && !books.length && music.length) setKind('music');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const list = kind === 'books' ? books : music;
  const free = (items ?? []).filter((w) => !w.claimed_by).length;

  return (
    <section className="panel friend-wishlist" aria-label={`${friendName}'s wishlist`}>
      {heading && (
        <div className="home-head">
          <h3>Gift ideas for {friendName}</h3>
          {items && items.length > 0 && <span className="muted small">{free} of {items.length} not taken yet</span>}
        </div>
      )}
      <p className="muted small">
        What {friendName} wants. Say “I’m getting this” and other friends see it’s taken. {friendName} never sees who’s getting what.
      </p>
      {error && <p className="account-error">{error}</p>}
      {items === undefined && !error && <p className="muted">Loading…</p>}
      {items && !items.length && <p className="muted">{friendName}’s wishlist is empty, or they keep it to themselves.</p>}
      {items && items.length > 0 && (
        <>
          {books.length > 0 && music.length > 0 && (
            <nav className="subtabs small-tabs" aria-label="Books or records">
              <button className={kind === 'books' ? 'active' : ''} onClick={() => setKind('books')}>Books ({books.length})</button>
              <button className={kind === 'music' ? 'active' : ''} onClick={() => setKind('music')}>Records and CDs ({music.length})</button>
            </nav>
          )}
          <ul className="wish-gifts">
            {list.map((w) => (
              <li key={w.id} className={w.claimed_by && !w.claimed_by_me ? 'taken' : ''}>
                <Cover url={w.cover ?? undefined} title={w.title} author={w.author ?? undefined} size="sm" square={w.kind !== 'book'} />
                <span className="wish-gift-text">
                  <strong>{w.title}</strong>
                  <span className="muted small">
                    {[w.author, formatWord(w.kind), w.year].filter(Boolean).join(' · ')}
                  </span>
                  {w.isbn && <span className="muted small mono">ISBN {formatIsbn13(w.isbn)}</span>}
                </span>
                <span className="wish-gift-action">
                  {w.claimed_by_me ? (
                    <>
                      <span className="gift-mine small">🎁 You’re getting this</span>
                      <button className="link small" disabled={busy === w.id} onClick={() => act(w, () => unclaimGift(friendId, w.id))}>Not anymore</button>
                    </>
                  ) : null}
                  {!w.claimed_by_me && w.claimed_by ? (
                    <span className="muted small">{w.claimed_by} is getting this</span>
                  ) : null}
                  {!w.claimed_by_me && !w.claimed_by ? <button className="btn small-btn" disabled={busy === w.id} onClick={() => act(w, () => claimGift(uid, friendId, w))}>I’m getting this</button> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** On your own wishlist: share it with friends for gift ideas, or keep it to yourself. */
export function WishlistSharing({ uid, onSeeFriends }: Readonly<{ uid: string; onSeeFriends: () => void }>) {
  const [open, setOpen] = useState<boolean>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    getWishlistOpen(uid).then(setOpen, (e) => setError((e as Error).message));
  }, [uid]);
  const change = async (v: boolean) => {
    setOpen(v);
    try {
      await setWishlistOpen(uid, v);
      setError(undefined);
    } catch (e) {
      setOpen(!v);
      setError((e as Error).message);
    }
  };
  if (error) return <p className="muted small wish-share">{error}</p>;
  if (open === undefined) return null;
  return (
    <div className="wish-share">
      <label className="check">
        <input type="checkbox" checked={open} onChange={(e) => void change(e.target.checked)} />
        <span>Friends can see my wishlist and wantlist for gift ideas</span>
      </label>
      <span className="muted small">
        {open ? 'They can mark what they’re getting you. You won’t see who picked what. ' : 'Your lists are private. '}
        <button className="link small" onClick={onSeeFriends}>See what your friends want</button>
      </span>
    </div>
  );
}
