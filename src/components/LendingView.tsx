import { useMemo, useState } from 'react';
import type { Book } from '../types';
import { isMusic } from '../types';
import { Cover } from './Cover';
import { Avatar } from './ProfileEditor';
import type { Friend } from '../lib/friends';
import { findMatches } from '../lib/wishlist';
import {
  cancelAsk,
  changeDue,
  daysLeft,
  decline,
  dueLabel,
  friendName,
  lend,
  lendTo,
  markReturned,
  weeksFromNow,
  type Loan,
} from '../lib/lending';

interface Props {
  uid: string;
  books: Book[];
  friends: Friend[];
  loans: Loan[];
  error?: string;
  /** Whether friends can browse your shelves; undefined while loading. */
  open?: boolean;
  onSetOpen: (open: boolean) => void;
  onChanged: () => void;
  onOpenProfile: (username: string) => void;
  onOpenBook: (b: Book) => void;
  /** Start reading something you borrowed. */
  onRead: (l: Loan) => void;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

function useAct(onChanged: () => void) {
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  return { busy, error, act };
}

function Row({ l, children, onOpenProfile, line }: Readonly<{ l: Loan; children?: React.ReactNode; onOpenProfile: (u: string) => void; line: React.ReactNode }>) {
  return (
    <li className="loan">
      <Cover url={l.item.cover} title={l.item.title} author={l.item.by} size="sm" square={l.item.kind !== 'book'} />
      <div className="loan-body">
        <strong>{l.item.title}</strong>
        {l.item.by && <span className="muted small">{l.item.by}</span>}
        <span className="loan-who small">
          <button className="loan-avatar" onClick={() => onOpenProfile(l.other.username)} aria-label={`Open @${l.other.username}`}>
            <Avatar p={l.other} size={20} />
          </button>
          {line}
        </span>
        {l.note && <span className="loan-note small">“{l.note}”</span>}
        <span className="loan-actions">{children}</span>
      </div>
    </li>
  );
}

function Due({ due }: Readonly<{ due: string | null }>) {
  const d = daysLeft(due);
  let cls = '';
  if (d !== undefined && d < 0) cls = 'late';
  else if (d !== undefined && d <= 3) cls = 'soon';
  return <span className={`loan-due ${cls}`}>{dueLabel(due)}</span>;
}

/** Answer a request: yes with a due date, or no, with an optional note either way. */
function Answer({ l, onChanged }: Readonly<{ l: Loan; onChanged: () => void }>) {
  const [due, setDue] = useState(weeksFromNow(3));
  const [reply, setReply] = useState('');
  const { busy, error, act } = useAct(onChanged);
  return (
    <div className="loan-answer">
      <label className="small">
        Back by <input type="date" value={due} min={weeksFromNow(0)} onChange={(e) => setDue(e.target.value)} />
      </label>
      <input className="loan-reply" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Note for them (optional)" maxLength={300} />
      <span className="loan-actions">
        <button className="btn primary small-btn" disabled={!!busy} onClick={() => act('yes', () => lend(l.id, due, reply))}>Lend it</button>
        <button className="btn ghost small-btn" disabled={!!busy} onClick={() => act('no', () => decline(l.id, reply))}>Not now</button>
      </span>
      {error && <span className="account-error small">{error}</span>}
    </div>
  );
}

function LentRow({ l, books, onChanged, onOpenProfile, onOpenBook }: Readonly<{ l: Loan; books: Book[]; onChanged: () => void; onOpenProfile: (u: string) => void; onOpenBook: (b: Book) => void }>) {
  const [editing, setEditing] = useState(false);
  const [due, setDue] = useState(l.due_on ?? weeksFromNow(2));
  const { busy, error, act } = useAct(onChanged);
  const b = books.find((x) => x.id === l.item_id);
  return (
    <Row l={l} onOpenProfile={onOpenProfile} line={<>With {friendName(l.other)} since {day(l.lent_at)} · <Due due={l.due_on} /></>}>
      {editing ? (
        <>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="New due date" />
          <button className="btn small-btn" disabled={!!busy} onClick={() => act('due', () => changeDue(l.id, due)).then(() => setEditing(false))}>Save</button>
          <button className="link small" onClick={() => setEditing(false)}>Cancel</button>
        </>
      ) : (
        <>
          <button className="btn primary small-btn" disabled={!!busy} onClick={() => act('back', () => markReturned(l.id))}>Got it back</button>
          <button className="link small" onClick={() => setEditing(true)}>Change due date</button>
          {b && <button className="link small" onClick={() => onOpenBook(b)}>Open</button>}
        </>
      )}
      {error && <span className="account-error small">{error}</span>}
    </Row>
  );
}

/** Lend something to a friend who didn't ask. */
function LendForm({ uid, books, friends, loans, onChanged }: Readonly<{ uid: string; books: Book[]; friends: Friend[]; loans: Loan[]; onChanged: () => void }>) {
  const [friend, setFriend] = useState('');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Book>();
  const [due, setDue] = useState(weeksFromNow(3));
  const { busy, error, act } = useAct(onChanged);
  const out = new Set(loans.filter((l) => l.owner === uid && l.status === 'lent').map((l) => l.item_id));
  const owned = books.filter((b) => b.owned !== false);
  const hits = pick ? [] : findMatches(owned, q).slice(0, 6);
  const accepted = friends.filter((f) => f.status === 'accepted');
  if (!accepted.length) return null;
  return (
    <section className="panel">
      <h3>Lend something to a friend</h3>
      <div className="lend-form">
        <select value={friend} onChange={(e) => setFriend(e.target.value)} aria-label="Friend">
          <option value="">Who to?</option>
          {accepted.map((f) => (
            <option key={f.id} value={f.id}>{friendName(f)}</option>
          ))}
        </select>
        {pick ? (
          <span className="lend-pick">
            <strong>{pick.title}</strong>
            <button className="link small" onClick={() => setPick(undefined)}>Change</button>
          </span>
        ) : (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a book or record you own" aria-label="Find something to lend" />
        )}
        <label className="small">
          Back by <input type="date" value={due} min={weeksFromNow(0)} onChange={(e) => setDue(e.target.value)} />
        </label>
        <button
          className="btn primary small-btn"
          disabled={!friend || !pick || !!busy}
          onClick={() =>
            act('lend', () => lendTo(uid, friend, pick!, due)).then(() => {
              setPick(undefined);
              setQ('');
            })
          }
        >
          Lend
        </button>
      </div>
      {hits.length > 0 && (
        <ul className="lend-hits">
          {hits.map((b) => (
            <li key={b.id}>
              <button disabled={out.has(b.id) || !!b.loan} onClick={() => setPick(b)}>
                <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" square={isMusic(b)} />
                <span>
                  <strong>{b.title}</strong>
                  <span className="muted small">{b.loan ? `Lent to ${b.loan.to}` : b.authors[0]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="account-error small">{error}</p>}
    </section>
  );
}

export function LendingView(props: Readonly<Props>) {
  const { uid, loans, onChanged, onOpenProfile } = props;
  const { busy, error, act } = useAct(onChanged);
  const g = useMemo(() => {
    const mine = loans.filter((l) => l.owner === uid);
    const theirs = loans.filter((l) => l.borrower === uid);
    const byDue = (a: Loan, b: Loan) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999');
    return {
      asks: mine.filter((l) => l.status === 'requested'),
      out: mine.filter((l) => l.status === 'lent').sort(byDue),
      borrowed: theirs.filter((l) => l.status === 'lent').sort(byDue),
      myAsks: theirs.filter((l) => l.status === 'requested'),
      answered: theirs.filter((l) => l.status === 'declined').slice(0, 5),
      history: loans.filter((l) => l.status === 'returned').slice(0, 8),
    };
  }, [loans, uid]);

  return (
    <div className="lending">
      <section className="panel lend-switch">
        <label className="check">
          <input type="checkbox" aria-label="Let friends browse my shelves and ask to borrow" checked={!!props.open} disabled={props.open === undefined} onChange={(e) => props.onSetOpen(e.target.checked)} />
          <span>
            <strong>Let friends browse my shelves and ask to borrow</strong>
            <span className="muted small">
              {' '}They see titles, authors and covers of what you own, and whether it's lent out. Never prices, notes or where it sits. You say yes or no to every request.
            </span>
          </span>
        </label>
        <p className="muted small">To borrow, open a friend's profile and look under “Their shelves”.</p>
      </section>

      {props.error && <p className="account-error">{props.error}</p>}

      {g.asks.length > 0 && (
        <section className="panel">
          <h3>Asking to borrow ({g.asks.length})</h3>
          <ul className="loans">
            {g.asks.map((l) => (
              <Row key={l.id} l={l} onOpenProfile={onOpenProfile} line={<>{friendName(l.other)} asked {day(l.created_at)}</>}>
                <Answer l={l} onChanged={onChanged} />
              </Row>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h3>Lent out{g.out.length ? ` (${g.out.length})` : ''}</h3>
        {g.out.length ? (
          <ul className="loans">
            {g.out.map((l) => (
              <LentRow key={l.id} l={l} books={props.books} onChanged={onChanged} onOpenProfile={onOpenProfile} onOpenBook={props.onOpenBook} />
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing lent to friends right now.</p>
        )}
      </section>

      <section className="panel">
        <h3>Borrowed{g.borrowed.length ? ` (${g.borrowed.length})` : ''}</h3>
        {g.borrowed.length ? (
          <ul className="loans">
            {g.borrowed.map((l) => (
              <Row key={l.id} l={l} onOpenProfile={onOpenProfile} line={<>From {friendName(l.other)} · <Due due={l.due_on} /></>}>
                {l.reply && <span className="loan-note small">{friendName(l.other)}: “{l.reply}”</span>}
                {l.item.kind === 'book' && <button className="btn small-btn" onClick={() => props.onRead(l)}>Start reading</button>}
                <span className="muted small">{friendName(l.other)} marks it returned when you give it back.</span>
              </Row>
            ))}
          </ul>
        ) : (
          <p className="muted">You haven't borrowed anything. Browse a friend's shelves on their profile.</p>
        )}
      </section>

      {(g.myAsks.length > 0 || g.answered.length > 0) && (
        <section className="panel">
          <h3>Your requests</h3>
          <ul className="loans">
            {g.myAsks.map((l) => (
              <Row key={l.id} l={l} onOpenProfile={onOpenProfile} line={<>Asked {friendName(l.other)} {day(l.created_at)}, waiting</>}>
                <button className="link small" disabled={busy === l.id} onClick={() => act(l.id, () => cancelAsk(l.id))}>Cancel request</button>
              </Row>
            ))}
            {g.answered.map((l) => (
              <Row key={l.id} l={l} onOpenProfile={onOpenProfile} line={<>{friendName(l.other)} can't lend it right now{l.reply ? `: “${l.reply}”` : ''}</>} />
            ))}
          </ul>
          {error && <p className="account-error small">{error}</p>}
        </section>
      )}

      <LendForm uid={uid} books={props.books} friends={props.friends} loans={loans} onChanged={onChanged} />

      {g.history.length > 0 && (
        <section className="panel">
          <h3>Recently returned</h3>
          <ul className="loan-history small">
            {g.history.map((l) => (
              <li key={l.id}>
                <strong>{l.item.title}</strong>{' '}
                <span className="muted">
                  {l.owner === uid ? `lent to ${friendName(l.other)}` : `borrowed from ${friendName(l.other)}`}, back {day(l.returned_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
