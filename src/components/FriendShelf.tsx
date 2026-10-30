import { useEffect, useMemo, useState } from 'react';
import { Cover } from './Cover';
import { askToBorrow, friendShelf, lendingOpen, type Loan, type ShelfItem } from '../lib/lending';

interface Props {
  uid: string;
  friendId: string;
  friendName: string;
  loans: Loan[];
  onChanged: () => void;
}

const KINDS = [
  ['all', 'All'],
  ['book', 'Books'],
  ['vinyl', 'Vinyl'],
  ['cd', 'CDs'],
] as const;

/** A friend's shelves on their profile, with "Ask to borrow". */
export function FriendShelf({ uid, friendId, friendName, loans, onChanged }: Props) {
  const [items, setItems] = useState<ShelfItem[] | null>();
  const [error, setError] = useState<string>();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('all');
  const [asking, setAsking] = useState<ShelfItem>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [askError, setAskError] = useState<string>();
  const [shown, setShown] = useState(48);

  useEffect(() => {
    let live = true;
    setItems(undefined);
    lendingOpen(friendId)
      .then((open) => (open ? friendShelf(friendId) : null))
      .then(
        (l) => live && setItems(l),
        (e) => live && setError((e as Error).message),
      );
    return () => {
      live = false;
    };
  }, [friendId]);

  // Your loans with this friend, by their item.
  const mine = useMemo(() => {
    const m = new Map<string, Loan>();
    for (const l of loans) if (l.owner === friendId && l.borrower === uid && (l.status === 'requested' || l.status === 'lent')) m.set(l.item_id, l);
    return m;
  }, [loans, friendId, uid]);

  if (error) return <p className="account-error small">{error}</p>;
  if (items === undefined) return null;
  if (items === null)
    return (
      <section className="profile-shelf">
        <h3 className="section-label">Their shelves</h3>
        <p className="muted small">{friendName} hasn't opened their shelves for borrowing. They can switch it on under Friends → Lending.</p>
      </section>
    );

  const kinds = new Set(items.map((x) => x.kind));
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = items.filter(
    (x) => (kind === 'all' || x.kind === kind) && words.every((w) => `${x.title} ${x.by ?? ''}`.toLowerCase().includes(w)),
  );

  const ask = async () => {
    if (!asking) return;
    setBusy(true);
    setAskError(undefined);
    try {
      await askToBorrow(uid, friendId, asking, note);
      setAsking(undefined);
      setNote('');
      onChanged();
    } catch (e) {
      setAskError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profile-shelf friend-shelf">
      <h3 className="section-label">Their shelves ({items.length.toLocaleString()})</h3>
      <div className="friend-shelf-tools">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${friendName}'s shelves`} aria-label="Search their shelves" />
        {kinds.size > 1 && (
          <nav className="subtabs" aria-label="What to show">
            {KINDS.filter(([k]) => k === 'all' || kinds.has(k)).map(([k, l]) => (
              <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>
            ))}
          </nav>
        )}
      </div>
      {asking && (
        <div className="ask-box">
          <Cover url={asking.cover ?? undefined} title={asking.title} author={asking.by ?? undefined} size="sm" square={asking.kind !== 'book'} />
          <div>
            <strong>Ask {friendName} to borrow “{asking.title}”</strong>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional), e.g. when you'll pick it up" maxLength={300} autoFocus />
            <span className="loan-actions">
              <button className="btn primary small-btn" disabled={busy} onClick={ask}>{busy ? 'Sending…' : 'Send request'}</button>
              <button className="link small" onClick={() => setAsking(undefined)}>Cancel</button>
            </span>
            {askError && <span className="account-error small">{askError}</span>}
          </div>
        </div>
      )}
      {list.length ? (
        <ul className="shelf-grid">
          {list.slice(0, shown).map((x) => {
            const l = mine.get(x.id);
            return (
              <li key={x.id}>
                <Cover url={x.cover ?? undefined} title={x.title} author={x.by ?? undefined} size="md" square={x.kind !== 'book'} />
                <strong>{x.title}</strong>
                {x.by && <span className="muted small">{x.by}</span>}
                {l?.status === 'lent' ? (
                  <span className="friend-badge">You have it</span>
                ) : l ? (
                  <span className="friend-badge muted">Requested</span>
                ) : x.out ? (
                  <span className="muted small">Lent out</span>
                ) : (
                  <button className="btn small-btn" onClick={() => setAsking(x)}>Ask to borrow</button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">{items.length ? 'Nothing matches.' : 'Nothing on their shelves yet.'}</p>
      )}
      {list.length > shown && <button className="btn ghost" onClick={() => setShown((n) => n + 96)}>Show more</button>}
    </section>
  );
}
