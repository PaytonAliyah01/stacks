import { useEffect, useMemo, useState } from 'react';
import type { Book, Reading } from '../types';
import { isMusic } from '../types';
import { Cover } from './Cover';
import { Avatar } from './ProfileEditor';
import { QuickProgress } from './ReadingView';
import { currentReading, formatDay, lastPage } from '../lib/reading';
import type { Friend } from '../lib/friends';
import {
  deleteBuddyRead,
  deleteMessage,
  findLocalBook,
  inviteMore,
  leaveBuddyRead,
  loadChat,
  memberName,
  memberPct,
  sendMessage,
  type BuddyRead,
  type ChatMessage,
} from '../lib/buddy';

interface Props {
  uid: string;
  books: Book[];
  readings: Reading[];
  friends: Friend[];
  reads: BuddyRead[];
  error?: string;
  onRefresh: () => void;
  onOpen: (b: Book) => void;
  onSaveReading: (r: Reading) => void;
  onStart: (book: Book, friendIds: string[], note: string, finishBy?: string) => Promise<void>;
  onJoin: (read: BuddyRead) => Promise<void>;
  onOpenProfile: (username: string) => void;
  onFindFriends: () => void;
}

const stars = (n: number) => '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '');
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function StartForm({ books, readings, friends, onStart, onCancel }: Pick<Props, 'books' | 'readings' | 'friends' | 'onStart'> & { onCancel: () => void }) {
  const [q, setQ] = useState('');
  const [book, setBook] = useState<Book>();
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [finishBy, setFinishBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const accepted = friends.filter((f) => f.status === 'accepted');
  // Books you're reading or want to read come first.
  const pool = useMemo(() => {
    const rank = (b: Book) => ({ reading: 0, want: 1 } as Record<string, number>)[currentReading(readings, b.id)?.status ?? ''] ?? 2;
    return books.filter((b) => !isMusic(b)).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [books, readings]);
  const hits = (q.trim() ? pool.filter((b) => `${b.title} ${b.authors.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())) : pool).slice(0, 6);

  const go = async () => {
    if (!book || !chosen.length) return;
    setBusy(true);
    setError(undefined);
    try {
      await onStart(book, chosen, note, finishBy || undefined);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="panel buddy-start">
      <h3>Start a buddy read</h3>
      <div className="field">
        <span>Which book?</span>
        {book ? (
          <div className="buddy-chosen">
            <Cover url={book.coverUrl} title={book.title} author={book.authors[0]} size="sm" />
            <span>
              <strong>{book.title}</strong>
              <span className="muted small">{book.authors[0]}</span>
            </span>
            <button className="link small" onClick={() => setBook(undefined)}>Change</button>
          </div>
        ) : (
          <>
            <input id="buddy-book" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your books" autoComplete="off" />
            <ul className="top-hits">
              {hits.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => setBook(b)}>
                    <strong>{b.title}</strong> <span className="muted small">{b.authors[0]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="field">
        <span>Read it with</span>
        {accepted.length ? (
          <div className="buddy-friends">
            {accepted.map((f) => (
              <label key={f.id} className={`buddy-friend ${chosen.includes(f.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={chosen.includes(f.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, f.id] : chosen.filter((x) => x !== f.id))} />
                <Avatar p={f} size={28} />
                <span>{f.display_name || `@${f.username}`}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="muted small">Add friends first, under Friends.</p>
        )}
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Finish by (optional)</span>
          <input type="date" value={finishBy} onChange={(e) => setFinishBy(e.target.value)} />
        </label>
        <label className="field">
          <span>Note (optional)</span>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="A chapter a day?" />
        </label>
      </div>
      {error && <p className="account-error">{error}</p>}
      <div className="account-actions">
        <button className="btn primary" disabled={!book || !chosen.length || busy} onClick={go}>{busy ? 'Starting…' : 'Invite and start'}</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function Chat({ read, uid, myPage, finished, onOpenProfile }: { read: BuddyRead; uid: string; myPage: number; finished: boolean; onOpenProfile: (u: string) => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>();
  const [body, setBody] = useState('');
  const [page, setPage] = useState(String(myPage || ''));
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const load = () => loadChat(read.id).then(setMsgs, (e) => setError((e as Error).message));
  useEffect(() => {
    void load();
    const t = window.setInterval(() => !document.hidden && void load(), 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read.id]);
  useEffect(() => setPage(String(myPage || '')), [myPage]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await sendMessage(read.id, uid, body, Number(page) || undefined);
      setBody('');
      void load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="buddy-chat">
      {error && <p className="account-error small">{error}</p>}
      {!msgs ? (
        <p className="muted small">Loading the chat…</p>
      ) : !msgs.length ? (
        <p className="muted small">No messages yet. Say what you think so far. Messages are tagged with your page, so nobody gets spoiled.</p>
      ) : (
        <ul className="chat-list">
          {msgs.map((m) => {
            const spoiler = !finished && m.page != null && m.page > myPage && m.user_id !== uid && !shown.has(m.id);
            return (
              <li key={m.id} className={m.user_id === uid ? 'mine' : ''}>
                <button className="post-who" onClick={() => onOpenProfile(m.username)} aria-label={`@${m.username}`}>
                  <Avatar p={m} size={30} />
                </button>
                <div className="chat-bubble">
                  <span className="chat-meta">
                    <strong>{m.user_id === uid ? 'You' : m.display_name || `@${m.username}`}</strong>
                    {m.page != null && <span className="chat-page">p. {m.page}</span>}
                    <span className="muted small">{when(m.created_at)}</span>
                  </span>
                  {spoiler ? (
                    <button className="chat-spoiler" onClick={() => setShown(new Set([...shown, m.id]))}>
                      Spoiler from page {m.page}. You're on page {myPage || 0}. Tap to read anyway.
                    </button>
                  ) : (
                    <p>{m.body}</p>
                  )}
                  {m.user_id === uid && (
                    <button className="link small muted" onClick={() => deleteMessage(m.id).then(load)}>Delete</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form className="chat-form" onSubmit={send}>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1000} placeholder="What do you think so far?" aria-label="Message" />
        <div className="chat-send">
          <label className="small">
            at page <input type="number" min={0} value={page} onChange={(e) => setPage(e.target.value)} aria-label="Page this is about" />
          </label>
          <button type="submit" className="btn primary small-btn" disabled={!body.trim()}>Send</button>
        </div>
      </form>
    </div>
  );
}

/** One buddy read. In a book club, `club` is the club's name. */
export function ReadCard(props: Props & { read: BuddyRead; club?: string }) {
  const { read, uid, books, readings, friends, onOpen, onRefresh, onJoin, onOpenProfile } = props;
  const me = read.members.find((m) => m.user_id === uid);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'delete'>();
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string>();
  const local = findLocalBook(read, me, books);
  const myReading = local && currentReading(readings, local.id);
  const pages = read.book.pages ?? local?.pageCount;
  const joined = read.members.filter((m) => m.status === 'joined');
  const invited = read.members.filter((m) => m.status === 'invited');
  const allDone = joined.length > 1 && joined.every((m) => m.finished_at);
  const myPage = me?.finished_at ? Infinity : (me?.page ?? (myReading ? lastPage(myReading) : undefined) ?? 0);
  const owner = read.owner === uid;
  const notIn = friends.filter((f) => f.status === 'accepted' && !read.members.some((m) => m.user_id === f.id));

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setBusy(false);
      onRefresh();
    }
  };

  return (
    <li className={`panel buddy-card ${me?.status === 'invited' ? 'invite' : ''}`}>
      <div className="buddy-top">
        <Cover url={read.book.cover ?? local?.coverUrl} title={read.book.title} author={read.book.by} size="sm" />
        <div className="buddy-title">
          {local ? <button className="link-plain" onClick={() => onOpen(local)}>{read.book.title}</button> : <strong>{read.book.title}</strong>}
          <span className="muted small">{[read.book.by, pages ? `${pages} pages` : ''].filter(Boolean).join(' · ')}</span>
          {read.note && <span className="buddy-note">“{read.note}”</span>}
          {read.finish_by && <span className="muted small">Finish by {formatDay(read.finish_by)}</span>}
        </div>
      </div>

      {error && <p className="account-error small">{error}</p>}
      {me?.status === 'invited' ? (
        <div className="buddy-invite">
          <p>
            {props.club ? (
              <><strong>{props.club}</strong> is reading this. Join when you start it, to see everyone’s progress and the chat.</>
            ) : (
              <>
                <strong>{memberName(read.members.find((m) => m.user_id === read.owner) ?? read.members[0])}</strong> wants to read this with you.
              </>
            )}
            {!local && ' It isn’t in your library yet; joining adds it as a book you’re reading.'}
          </p>
          <div className="account-actions">
            <button className="btn primary" disabled={busy} onClick={() => act(() => onJoin(read))}>Join</button>
            {!props.club && <button className="btn ghost" disabled={busy} onClick={() => act(() => leaveBuddyRead(read.id, uid))}>No thanks</button>}
          </div>
        </div>
      ) : (
        <>
          {allDone && (
            <div className="buddy-done">
              <strong>Everyone finished! 🎉</strong>
              <ul>
                {[...joined]
                  .sort((a, b) => (a.finished_at ?? '').localeCompare(b.finished_at ?? ''))
                  .map((m, i) => (
                    <li key={m.user_id}>
                      {i === 0 ? '🥇 ' : ''}
                      {m.user_id === uid ? 'You' : memberName(m)} · {formatDay(m.finished_at!)}
                      {m.rating ? <span className="post-stars"> {stars(m.rating)}</span> : null}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <ul className="buddy-progress">
            {joined.map((m) => {
              const pct = memberPct(m, pages);
              return (
                <li key={m.user_id}>
                  <button className="post-who" onClick={() => onOpenProfile(m.username)} aria-label={`@${m.username}`}>
                    <Avatar p={m} size={32} />
                  </button>
                  <span className="buddy-who">
                    <span className="buddy-name">
                      <strong>{m.user_id === uid ? 'You' : memberName(m)}</strong>
                      <span className="muted small">
                        {m.finished_at ? `finished ${formatDay(m.finished_at)}` : m.page != null ? `page ${m.page}${pages ? ` of ${pages}` : ''}` : pct ? `${pct}%` : 'not started'}
                      </span>
                    </span>
                    <span className="progress-bar"><i style={{ width: `${pct}%` }} /></span>
                  </span>
                </li>
              );
            })}
            {invited.map((m) => (
              <li key={m.user_id} className="buddy-invited">
                <Avatar p={m} size={32} />
                <span className="muted small">{memberName(m)} hasn't joined yet</span>
              </li>
            ))}
          </ul>

          {local && myReading && myReading.status === 'reading' && <QuickProgress book={local} reading={myReading} onChange={props.onSaveReading} />}
          {local && (!myReading || myReading.status === 'want') && (
            <p className="muted small">Open the book and press “Reading” to start. Your progress shows here as you update it.</p>
          )}

          <div className="buddy-actions">
            <button className={`btn small-btn ${chat ? '' : 'primary'}`} onClick={() => setChat(!chat)}>{chat ? 'Hide chat' : 'Chat'}</button>
            {owner && !props.club && notIn.length > 0 && !inviting && <button className="btn ghost small-btn" onClick={() => setInviting(true)}>Invite more</button>}
            {confirm ? (
              <>
                <button className="btn danger small-btn" disabled={busy} onClick={() => act(() => (confirm === 'delete' ? deleteBuddyRead(read.id) : leaveBuddyRead(read.id, uid)))}>
                  {confirm === 'delete' ? 'Delete for everyone' : 'Leave'}
                </button>
                <button className="link small" onClick={() => setConfirm(undefined)}>Keep it</button>
              </>
            ) : (
              <button className="link small muted" onClick={() => setConfirm(owner ? 'delete' : 'leave')}>{owner ? 'Delete' : 'Leave'}</button>
            )}
          </div>
          {inviting && (
            <div className="buddy-friends">
              {notIn.map((f) => (
                <button key={f.id} className="buddy-friend" disabled={busy} onClick={() => act(() => inviteMore(read.id, [f.id])).then(() => setInviting(false))}>
                  <Avatar p={f} size={28} /> <span>Invite {f.display_name || `@${f.username}`}</span>
                </button>
              ))}
              <button className="link small" onClick={() => setInviting(false)}>Cancel</button>
            </div>
          )}
          {chat && <Chat read={read} uid={uid} myPage={myPage === Infinity ? 1e9 : myPage} finished={!!me?.finished_at} onOpenProfile={onOpenProfile} />}
        </>
      )}
    </li>
  );
}

export function BuddyView(props: Props) {
  const [starting, setStarting] = useState(false);
  const { friends } = props;
  // Book club books live on the Book clubs page.
  const reads = props.reads.filter((r) => !r.club_id);
  const invites = reads.filter((r) => r.members.find((m) => m.user_id === props.uid)?.status === 'invited');
  const mine = reads.filter((r) => !invites.includes(r));
  const hasFriends = friends.some((f) => f.status === 'accepted');
  return (
    <div className="buddy">
      <div className="buddy-intro">
        <p className="muted">Read a book together: see each other's progress and talk about it without spoilers.</p>
        {!starting && (hasFriends ? (
          <button className="btn primary" onClick={() => setStarting(true)}>Start a buddy read</button>
        ) : (
          <button className="btn" onClick={props.onFindFriends}>Add friends first</button>
        ))}
      </div>
      {props.error && <p className="account-error">{props.error}</p>}
      {starting && (
        <StartForm
          books={props.books}
          readings={props.readings}
          friends={friends}
          onCancel={() => setStarting(false)}
          onStart={async (b, ids, note, by) => {
            await props.onStart(b, ids, note, by);
            setStarting(false);
          }}
        />
      )}
      {invites.length > 0 && (
        <>
          <h3 className="section-label">Invites</h3>
          <ul className="buddy-list">{invites.map((r) => <ReadCard key={r.id} {...props} reads={reads} read={r} />)}</ul>
        </>
      )}
      {mine.length > 0 ? (
        <ul className="buddy-list">{mine.map((r) => <ReadCard key={r.id} {...props} reads={reads} read={r} />)}</ul>
      ) : (
        !starting && !invites.length && <p className="muted">No buddy reads yet.</p>
      )}
    </div>
  );
}
