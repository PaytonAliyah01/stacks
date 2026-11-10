import { useEffect, useMemo, useState } from 'react';
import type { Book, Reading } from '../types';
import { isMusic } from '../types';
import { Cover } from './Cover';
import { Avatar } from './ProfileEditor';
import { ReadCard } from './BuddyView';
import { currentReading, formatDay } from '../lib/reading';
import type { Friend } from '../lib/friends';
import type { BuddyBook, BuddyRead } from '../lib/buddy';
import {
  clubBookOf,
  currentRead,
  deleteClub,
  inviteToClub,
  joinClub,
  leaveClub,
  meetingLabel,
  meetingSoon,
  memberName,
  pickBook,
  removeSuggestion,
  setMeeting,
  startClub,
  suggestBook,
  updateClub,
  vote,
  type Club,
  type ClubSuggestion,
} from '../lib/clubs';

interface Props {
  uid: string;
  books: Book[];
  readings: Reading[];
  friends: Friend[];
  clubs: Club[];
  reads: BuddyRead[];
  error?: string;
  onRefresh: () => void;
  onOpen: (b: Book) => void;
  onSaveReading: (r: Reading) => void;
  onJoinRead: (read: BuddyRead) => Promise<void>;
  onOpenProfile: (username: string) => void;
  onFindFriends: () => void;
}

const nameOf = (f: { display_name: string | null; username: string }) => f.display_name || `@${f.username}`;
const stars = (n: number) => `${n.toFixed(1).replace('.0', '')}★`;

/** "2026-11-14T19:30" for a datetime-local input, in your own time zone. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function FriendPicker({ friends, chosen, onChange }: Readonly<{ friends: Friend[]; chosen: string[]; onChange: (ids: string[]) => void }>) {
  return (
    <div className="buddy-friends">
      {friends.map((f) => (
        <label key={f.id} className={`buddy-friend ${chosen.includes(f.id) ? 'on' : ''}`}>
          <input type="checkbox" checked={chosen.includes(f.id)} onChange={(e) => onChange(e.target.checked ? [...chosen, f.id] : chosen.filter((x) => x !== f.id))} />
          <Avatar p={f} size={28} />
          <span>{nameOf(f)}</span>
        </label>
      ))}
    </div>
  );
}

/** Pick a book: one from your library, or any title you type. */
function BookPicker({ books, readings, value, onChange }: Readonly<{ books: Book[]; readings: Reading[]; value?: BuddyBook; onChange: (b?: BuddyBook) => void }>) {
  const [q, setQ] = useState('');
  const [author, setAuthor] = useState('');
  const pool = useMemo(() => {
    const rank = (b: Book) => ({ want: 0, reading: 1 } as Record<string, number>)[currentReading(readings, b.id)?.status ?? ''] ?? (b.wishlist ? 1 : 2);
    return books.filter((b) => !isMusic(b)).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [books, readings]);
  const term = q.trim().toLowerCase();
  const hits = (term ? pool.filter((b) => `${b.title} ${b.authors.join(' ')}`.toLowerCase().includes(term)) : pool).slice(0, 5);
  if (value)
    return (
      <div className="buddy-chosen">
        <Cover url={value.cover} title={value.title} author={value.by} size="sm" />
        <span>
          <strong>{value.title}</strong>
          <span className="muted small">{value.by}</span>
        </span>
        <button type="button" className="link small" onClick={() => onChange(undefined)}>Change</button>
      </div>
    );
  return (
    <>
      <input type="search" className="club-book-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your books, or type any title" autoComplete="off" />
      <ul className="top-hits">
        {hits.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onChange(clubBookOf(b))}>
              <strong>{b.title}</strong> <span className="muted small">{b.authors[0]}</span>
            </button>
          </li>
        ))}
      </ul>
      {term && (
        <div className="club-typed">
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" aria-label="Author" />
          <button type="button" className="btn small-btn" onClick={() => onChange({ title: q.trim(), by: author.trim() || undefined })}>
            Use “{q.trim()}”
          </button>
        </div>
      )}
    </>
  );
}

function StartClub({ friends, onStart, onCancel }: Readonly<{ friends: Friend[]; onStart: (name: string, about: string, ids: string[]) => Promise<void>; onCancel: () => void }>) {
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <section className="panel buddy-start">
      <h3>Start a book club</h3>
      <label className="field">
        <span>Name</span>
        <input id="club-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunday Tea and Books" />
      </label>
      <label className="field">
        <span>What it's about (optional)</span>
        <input id="club-about" value={about} maxLength={500} onChange={(e) => setAbout(e.target.value)} placeholder="One book a month, mostly fantasy. We meet at Ana's." />
      </label>
      <div className="field">
        <span>Invite friends</span>
        {friends.length ? <FriendPicker friends={friends} chosen={chosen} onChange={setChosen} /> : <p className="muted small">Add friends first, under Friends. You can invite them later too.</p>}
      </div>
      {error && <p className="account-error">{error}</p>}
      <div className="account-actions">
        <button
          className="btn primary"
          disabled={!name.trim() || busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await onStart(name, about, chosen);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? 'Starting…' : chosen.length ? 'Start and invite' : 'Start the club'}
        </button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function MeetingForm({ initial, onSave, onCancel, saveLabel }: Readonly<{ initial?: { meet_at: string | null; meet_where: string | null }; onSave: (m: { meet_at: string | null; meet_where: string }) => Promise<void>; onCancel?: () => void; saveLabel: string }>) {
  const [at, setAt] = useState(toLocalInput(initial?.meet_at));
  const [where, setWhere] = useState(initial?.meet_where ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="club-meeting-form">
      <div className="grid-2">
        <label className="field">
          <span>Meeting (optional)</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label className="field">
          <span>Where (optional)</span>
          <input value={where} maxLength={200} onChange={(e) => setWhere(e.target.value)} placeholder="Ana's place, or a video call link" />
        </label>
      </div>
      <div className="account-actions">
        <button
          className="btn primary small-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSave({ meet_at: fromLocalInput(at), meet_where: where });
            setBusy(false);
          }}
        >
          {saveLabel}
        </button>
        {onCancel && <button className="link small" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

function ClubPage(props: Readonly<Props & { club: Club; onBack: () => void }>) {
  const { club, uid, friends, onRefresh } = props;
  const host = club.owner === uid;
  const me = club.members.find((m) => m.user_id === uid);
  const joined = club.members.filter((m) => m.status === 'joined');
  const invited = club.members.filter((m) => m.status === 'invited');
  const now = club.books[0];
  const read = currentRead(club, props.reads);
  const past = club.books.slice(1);
  const notIn = friends.filter((f) => f.status === 'accepted' && !club.members.some((m) => m.user_id === f.id));
  const suggestions = [...club.suggestions].sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at));

  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'invite' | 'edit' | 'meeting' | 'suggest' | 'pick' | 'delete' | 'leave'>();
  const [chosen, setChosen] = useState<string[]>([]);
  const [book, setBook] = useState<BuddyBook>();
  const [fromSuggestion, setFromSuggestion] = useState<string>();
  const [note, setNote] = useState('');
  const [name, setName] = useState(club.name);
  const [about, setAbout] = useState(club.about);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      setMode(undefined);
      after?.();
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setBusy(false);
      onRefresh();
    }
  };
  const startPick = (s?: ClubSuggestion) => {
    setBook(s?.book);
    setFromSuggestion(s?.id);
    setMode('pick');
  };
  const soon = now?.meet_at ? meetingSoon(now.meet_at) : undefined;

  return (
    <div className="club-page">
      <button className="link small profile-back" onClick={props.onBack}>← All book clubs</button>
      <div className="club-head">
        <div>
          <h3 className="club-name">{club.name}</h3>
          {club.about && <p className="muted">{club.about}</p>}
        </div>
        <ul className="club-faces" aria-label="Members">
          {joined.map((m) => (
            <li key={m.user_id}>
              <button className="post-who" onClick={() => props.onOpenProfile(m.username)} title={m.user_id === uid ? 'You' : memberName(m)}>
                <Avatar p={m} size={32} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="muted small">
        {joined.length} member{joined.length === 1 ? '' : 's'}
        {invited.length > 0 && ` · ${invited.map(memberName).join(', ')} invited`}
        {` · hosted by ${host ? 'you' : memberName(club.members.find((m) => m.user_id === club.owner) ?? { display_name: '', username: '?' })}`}
      </p>
      <div className="buddy-actions">
        {me?.status === 'joined' && notIn.length > 0 && <button className="btn ghost small-btn" onClick={() => setMode(mode === 'invite' ? undefined : 'invite')}>Invite friends</button>}
        {host && <button className="link small" onClick={() => setMode(mode === 'edit' ? undefined : 'edit')}>Edit club</button>}
        {host ? (
          <button className="link small muted" onClick={() => setMode('delete')}>Delete club</button>
        ) : (
          <button className="link small muted" onClick={() => setMode('leave')}>Leave club</button>
        )}
      </div>
      {error && <p className="account-error">{error}</p>}
      {(mode === 'delete' || mode === 'leave') && (
        <div className="confirm-row">
          <span>{mode === 'delete' ? 'Delete the club for everyone? Its books stay as buddy reads.' : 'Leave this club?'}</span>
          <button className="btn danger small-btn" disabled={busy} onClick={() => act(() => (mode === 'delete' ? deleteClub(club.id) : leaveClub(club.id, uid)), props.onBack)}>
            {mode === 'delete' ? 'Delete' : 'Leave'}
          </button>
          <button className="link small" onClick={() => setMode(undefined)}>Keep it</button>
        </div>
      )}
      {mode === 'invite' && (
        <div className="panel">
          <FriendPicker friends={notIn} chosen={chosen} onChange={setChosen} />
          <div className="account-actions">
            <button className="btn primary small-btn" disabled={!chosen.length || busy} onClick={() => act(() => inviteToClub(club.id, uid, chosen), () => setChosen([]))}>Invite</button>
            <button className="link small" onClick={() => setMode(undefined)}>Cancel</button>
          </div>
        </div>
      )}
      {mode === 'edit' && (
        <div className="panel">
          <label className="field">
            <span>Name</span>
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>What it's about</span>
            <input value={about} maxLength={500} onChange={(e) => setAbout(e.target.value)} />
          </label>
          <div className="account-actions">
            <button className="btn primary small-btn" disabled={!name.trim() || busy} onClick={() => act(() => updateClub(club.id, name, about))}>Save</button>
            <button className="link small" onClick={() => setMode(undefined)}>Cancel</button>
          </div>
        </div>
      )}

      <section className="panel club-now">
        <div className="home-head">
          <h3>Reading now</h3>
          {host && now && mode !== 'pick' && <button className="link small" onClick={() => startPick()}>Pick the next book</button>}
        </div>
        {now ? (
          <>
            <div className={`club-meeting${soon === 'today' || soon === 'tomorrow' || soon === 'now' ? ' soon' : ''}`}>
              {now.meet_at ? (
                <>
                  <span className="stat-label">Next meeting{soon && soon !== 'past' ? ` · ${soon}` : ''}</span>
                  <strong>{meetingLabel(now.meet_at)}</strong>
                  {now.meet_where && (/^https?:\/\//.test(now.meet_where) ? <a href={now.meet_where} target="_blank" rel="noreferrer">{now.meet_where}</a> : <span>{now.meet_where}</span>)}
                  {soon === 'past' && <span className="muted small">That meeting has passed.{host ? ' Set the next one, or pick the next book.' : ''}</span>}
                </>
              ) : (
                <span className="muted">No meeting set yet.</span>
              )}
              {host && mode !== 'meeting' && <button className="link small" onClick={() => setMode('meeting')}>{now.meet_at ? 'Change' : 'Set a meeting'}</button>}
            </div>
            {mode === 'meeting' && (
              <MeetingForm initial={now} saveLabel="Save meeting" onCancel={() => setMode(undefined)} onSave={(m) => act(() => setMeeting(now.read_id, m))} />
            )}
            {read ? (
              <ul className="buddy-list">
                <ReadCard {...props} onJoin={props.onJoinRead} onStart={async () => undefined} read={read} club={club.name} />
              </ul>
            ) : (
              <div className="buddy-chosen">
                <Cover url={now.book.cover} title={now.book.title} author={now.book.by} size="sm" />
                <span>
                  <strong>{now.book.title}</strong>
                  <span className="muted small">{now.book.by}</span>
                </span>
              </div>
            )}
          </>
        ) : host ? (
          mode !== 'pick' && (
            <>
              <p className="muted">Pick the club's first book, or let everyone suggest some and vote first.</p>
              <button className="btn primary" onClick={() => startPick()}>Pick the first book</button>
            </>
          )
        ) : (
          <p className="muted">No book yet. Suggest one below; the host picks.</p>
        )}
        {mode === 'pick' && (
          <div className="club-pick">
            <h4>{now ? 'Next book' : 'First book'}</h4>
            <BookPicker books={props.books} readings={props.readings} value={book} onChange={(b) => { setBook(b); setFromSuggestion(undefined); }} />
            <MeetingForm
              saveLabel={busy ? 'Starting…' : 'Start reading it'}
              onCancel={() => setMode(undefined)}
              onSave={async (m) => {
                if (!book) return setError('Choose a book first.');
                await act(() => pickBook(club, uid, book, m, fromSuggestion));
              }}
            />
            <p className="muted small">Everyone in the club gets it as a buddy read, with progress and a spoiler-free chat.</p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="home-head">
          <h3>What next? Vote</h3>
          {me?.status === 'joined' && mode !== 'suggest' && <button className="link small" onClick={() => { setBook(undefined); setNote(''); setMode('suggest'); }}>Suggest a book</button>}
        </div>
        {mode === 'suggest' && (
          <div className="club-pick">
            <BookPicker books={props.books} readings={props.readings} value={book} onChange={setBook} />
            <label className="field">
              <span>Why this one? (optional)</span>
              <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Short, and everyone's been talking about it" />
            </label>
            <div className="account-actions">
              <button className="btn primary small-btn" disabled={!book || busy} onClick={() => act(() => suggestBook(club, uid, book!, note))}>Suggest it</button>
              <button className="link small" onClick={() => setMode(undefined)}>Cancel</button>
            </div>
          </div>
        )}
        {suggestions.length ? (
          <ul className="club-suggestions">
            {suggestions.map((s) => (
              <li key={s.id}>
                <Cover url={s.book.cover} title={s.book.title} author={s.book.by} size="sm" />
                <span className="club-sug-text">
                  <strong>{s.book.title}</strong>
                  <span className="muted small">{[s.book.by, `suggested by ${s.user_id === uid ? 'you' : s.by}`].filter(Boolean).join(' · ')}</span>
                  {s.note && <span className="buddy-note">“{s.note}”</span>}
                  <span className="club-sug-actions">
                    {host && <button className="link small" onClick={() => startPick(s)}>Make it the {now ? 'next' : 'first'} book</button>}
                    {(host || s.user_id === uid) && <button className="link small muted" disabled={busy} onClick={() => act(() => removeSuggestion(s.id))}>Remove</button>}
                  </span>
                </span>
                <button
                  className={`vote-btn${s.voted ? ' on' : ''}`}
                  aria-pressed={s.voted}
                  disabled={busy || me?.status !== 'joined'}
                  onClick={() => act(() => vote(s, uid))}
                  title={s.voted ? 'Take back your vote' : 'Vote for this one'}
                >
                  <span aria-hidden="true">▲</span>
                  <span>{s.votes}</span>
                  <span className="sr-only"> votes</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          mode !== 'suggest' && <p className="muted">No suggestions yet. Suggest a book and the club votes on it.</p>
        )}
      </section>

      {past.length > 0 && (
        <section className="panel">
          <div className="home-head">
            <h3>Read together</h3>
            <span className="muted small">{past.length} book{past.length === 1 ? '' : 's'}</span>
          </div>
          <ul className="club-past">
            {past.map((b) => (
              <li key={b.read_id}>
                <Cover url={b.book.cover} title={b.book.title} author={b.book.by} size="sm" />
                <span>
                  <strong>{b.book.title}</strong>
                  <span className="muted small">
                    {[b.book.by, formatDay((b.meet_at ?? b.created_at).slice(0, 10)), b.finished ? `${b.finished} finished` : '', b.rating ? stars(b.rating) : ''].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ClubCard({ club, uid, onOpen, onJoin, onDecline, busy }: Readonly<{ club: Club; uid: string; onOpen: () => void; onJoin: () => void; onDecline: () => void; busy: boolean }>) {
  const me = club.members.find((m) => m.user_id === uid);
  const now = club.books[0];
  const joined = club.members.filter((m) => m.status === 'joined');
  const inviter = club.members.find((m) => m.user_id === club.owner);
  return (
    <li className={`panel club-card${me?.status === 'invited' ? ' invite' : ''}`}>
      <button className="club-card-main link-plain" onClick={onOpen}>
        {now ? <Cover url={now.book.cover} title={now.book.title} author={now.book.by} size="sm" /> : <span className="club-card-empty" aria-hidden="true">📚</span>}
        <span>
          <strong>{club.name}</strong>
          <span className="muted small">
            {joined.length} member{joined.length === 1 ? '' : 's'}
            {now ? ` · reading ${now.book.title}` : ' · no book yet'}
          </span>
          {now?.meet_at && meetingSoon(now.meet_at) !== 'past' && <span className="small club-card-meet">Meets {meetingLabel(now.meet_at)}</span>}
        </span>
      </button>
      {me?.status === 'invited' && (
        <div className="buddy-invite">
          <p>
            {inviter && inviter.user_id !== uid ? <strong>{memberName(inviter)}</strong> : 'Someone'} invited you to this club.
          </p>
          <div className="account-actions">
            <button className="btn primary" disabled={busy} onClick={onJoin}>Join</button>
            <button className="btn ghost" disabled={busy} onClick={onDecline}>No thanks</button>
          </div>
        </div>
      )}
    </li>
  );
}

const OPEN = 'stacks.club.open';

export function ClubsView(props: Readonly<Props>) {
  const { clubs, uid, friends } = props;
  const [starting, setStarting] = useState(false);
  const [openId, setOpenId] = useState<string | undefined>(() => {
    try {
      return sessionStorage.getItem(OPEN) ?? undefined;
    } catch {
      return undefined;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    try {
      if (openId) sessionStorage.setItem(OPEN, openId);
      else sessionStorage.removeItem(OPEN);
    } catch {
      /* blocked */
    }
  }, [openId]);
  const accepted = friends.filter((f) => f.status === 'accepted');
  const open = clubs.find((c) => c.id === openId);
  const meIn = (c: Club) => c.members.find((m) => m.user_id === uid)?.status;
  const invites = clubs.filter((c) => meIn(c) === 'invited');
  const mine = clubs.filter((c) => meIn(c) !== 'invited');

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    props.onRefresh();
  };

  if (open && meIn(open) === 'joined') return <ClubPage {...props} club={open} onBack={() => setOpenId(undefined)} />;

  const card = (c: Club) => (
    <ClubCard
      key={c.id}
      club={c}
      uid={uid}
      busy={busy}
      onOpen={() => (meIn(c) === 'joined' ? setOpenId(c.id) : undefined)}
      onJoin={() => act(() => joinClub(c, uid)).then(() => setOpenId(c.id))}
      onDecline={() => act(() => leaveClub(c.id, uid))}
    />
  );

  return (
    <div className="buddy clubs">
      <div className="buddy-intro">
        <p className="muted">A book club with friends: one book at a time, a meeting date, everyone's progress, a spoiler-free chat, and a vote on what's next.</p>
        {!starting && <button className="btn primary" onClick={() => setStarting(true)}>Start a book club</button>}
      </div>
      {(props.error || error) && <p className="account-error">{props.error || error}</p>}
      {starting && (
        <StartClub
          friends={accepted}
          onCancel={() => setStarting(false)}
          onStart={async (name, about, ids) => {
            const id = await startClub(uid, name, about, ids);
            setStarting(false);
            props.onRefresh();
            setOpenId(id);
          }}
        />
      )}
      {invites.length > 0 && (
        <>
          <h3 className="section-label">Invites</h3>
          <ul className="buddy-list">{invites.map(card)}</ul>
        </>
      )}
      {mine.length > 0 ? (
        <ul className="buddy-list">{mine.map(card)}</ul>
      ) : (
        !starting && !invites.length && <p className="muted">No book clubs yet.{!accepted.length && <> <button className="link" onClick={props.onFindFriends}>Add friends</button> to invite them.</>}</p>
      )}
    </div>
  );
}
