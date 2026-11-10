import { useMemo, useState } from 'react';
import type { Book, ChallengeMeasure, Reading } from '../types';
import { Avatar } from './ProfileEditor';
import type { Friend } from '../lib/friends';
import {
  deleteGroup,
  inviteToGroup,
  joinGroup,
  leaveGroup,
  memberName,
  myProgress,
  startGroupChallenge,
  timePassed,
  type GroupChallenge,
} from '../lib/groupchallenges';
import { unitWord } from '../lib/labels';

interface Props {
  uid: string;
  books: Book[];
  readings: Reading[];
  friends: Friend[];
  groups: GroupChallenge[];
  error?: string;
  onChanged: () => void;
  onOpenProfile: (username: string) => void;
  onFindFriends: () => void;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const unit = (m: ChallengeMeasure, n: number) => unitWord(m, n);

/** Ready-made challenges, so starting one is two taps. */
function presets(now = new Date()) {
  const y = now.getFullYear();
  const endOfMonth = (m: number) => iso(new Date(y, m + 1, 0));
  const nextMonth = new Date(y, now.getMonth() + 1, 1);
  return [
    { label: `${y} reading race`, name: `${y} reading race`, measure: 'books' as const, goal: 24, start_on: `${y}-01-01`, end_on: `${y}-12-31` },
    {
      label: `${nextMonth.toLocaleDateString(undefined, { month: 'long' })} pages`,
      name: `${nextMonth.toLocaleDateString(undefined, { month: 'long' })} pages`,
      measure: 'pages' as const,
      goal: 1000,
      start_on: iso(nextMonth),
      end_on: iso(new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0)),
    },
    { label: 'Summer reading', name: `Summer reading ${y}`, measure: 'books' as const, goal: 6, start_on: `${y}-06-01`, end_on: endOfMonth(7) },
  ];
}

function StartForm({ uid, friends, books, readings, onDone, onCancel }: Readonly<{ uid: string; friends: Friend[]; books: Book[]; readings: Reading[]; onDone: () => void; onCancel: () => void }>) {
  const p0 = presets()[0];
  const [name, setName] = useState(p0.name);
  const [measure, setMeasure] = useState<ChallengeMeasure>(p0.measure);
  const [goal, setGoal] = useState(String(p0.goal));
  const [start, setStart] = useState(p0.start_on);
  const [end, setEnd] = useState(p0.end_on);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const accepted = friends.filter((f) => f.status === 'accepted');
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const valid = name.trim() && Number(goal) > 0 && start && end && end >= start && chosen.length > 0;

  const start_ = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const c = { name, measure, goal: Math.round(Number(goal)), start_on: start, end_on: end };
      await startGroupChallenge(uid, c, chosen, myProgress(c, readings, byId));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel group-start">
      <h3>Start a challenge with friends</h3>
      <div className="group-presets">
        {presets().map((p) => (
          <button
            key={p.label}
            className="btn ghost small-btn"
            onClick={() => {
              setName(p.name);
              setMeasure(p.measure);
              setGoal(String(p.goal));
              setStart(p.start_on);
              setEnd(p.end_on);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="group-form">
        <label className="field span-2">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="field">
          <span>Goal</span>
          <span className="group-goal">
            <input type="number" min={1} value={goal} onChange={(e) => setGoal(e.target.value)} />
            <select value={measure} onChange={(e) => setMeasure(e.target.value as ChallengeMeasure)} aria-label="Books or pages">
              <option value="books">books</option>
              <option value="pages">pages</option>
            </select>
          </span>
        </label>
        <label className="field">
          <span>From</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Until</span>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <span>Who's in?</span>
        <div className="buddy-friends">
          {accepted.map((f) => (
            <label key={f.id} className={`buddy-friend ${chosen.includes(f.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={chosen.includes(f.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, f.id] : chosen.filter((x) => x !== f.id))} />
              <Avatar p={f} size={28} />
              <span>{f.display_name || `@${f.username}`}</span>
            </label>
          ))}
        </div>
      </div>
      <p className="muted small">Books you finish between the two dates count, including ones you already finished. Everyone's progress updates by itself as they read.</p>
      {error && <p className="account-error small">{error}</p>}
      <div className="loan-actions">
        <button className="btn primary" disabled={!valid || busy} onClick={start_}>{busy ? 'Starting…' : 'Invite and start'}</button>
        <button className="link small" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function Card({ g, uid, friends, onChanged, onOpenProfile, onJoin }: Readonly<{ g: GroupChallenge; uid: string; friends: Friend[]; onChanged: () => void; onOpenProfile: (u: string) => void; onJoin: () => Promise<void> }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const me = g.members.find((m) => m.user_id === uid);
  const invited = me?.status === 'invited';
  const joined = g.members.filter((m) => m.status === 'joined').sort((a, b) => b.progress - a.progress);
  const pending = g.members.filter((m) => m.status === 'invited');
  const notIn = friends.filter((f) => f.status === 'accepted' && !g.members.some((m) => m.user_id === f.id));
  const passed = timePassed(g);
  const today = iso(new Date());
  const ended = g.end_on < today;
  const notYet = g.start_on > today;
  const leader = joined[0];
  const owner = g.members.find((m) => m.user_id === g.owner);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // Ties share a place.
  let place = 0;
  const places = joined.map((m, i) => {
        if (i === 0 || m.progress !== joined[i - 1].progress) place = i + 1;
        return place;
      });

  return (
    <article className={`panel group-card ${invited ? 'invite' : ''}`}>
      <header className="group-head">
        <div>
          <h3 className="group-name">{g.name}</h3>
          <p className="muted small">
            {g.goal.toLocaleString()} {unit(g.measure, g.goal)} · {day(g.start_on)} to {day(g.end_on)}
            {ended ? ' · finished' : null}
            {!ended && notYet ? ' · starts soon' : null}
            {!ended && !notYet ? ` · ${daysUntilEnd(g.end_on)} days left` : null}
          </p>
        </div>
        {ended && leader && leader.progress > 0 && <span className="group-winner">🏆 {memberName(leader)}</span>}
      </header>

      {invited && (
        <div className="group-invite">
          <span>{owner ? `${memberName(owner)} invited you.` : 'You’re invited.'} Books you finish in this time count, also ones already done.</span>
          <span className="loan-actions">
            <button className="btn primary small-btn" disabled={busy} onClick={() => act(onJoin)}>Join</button>
            <button className="btn ghost small-btn" disabled={busy} onClick={() => act(() => leaveGroup(g.id, uid))}>No thanks</button>
          </span>
        </div>
      )}

      <ol className="group-board">
        {joined.map((m, i) => {
          const pct = Math.min(100, Math.round((m.progress / g.goal) * 100));
          return (
            <li key={m.user_id} className={m.user_id === uid ? 'me' : ''}>
              <span className="group-place">{places[i]}</span>
              <button className="loan-avatar" onClick={() => onOpenProfile(m.username)} aria-label={`Open @${m.username}`}>
                <Avatar p={m} size={32} />
              </button>
              <div className="group-bar">
                <div className="group-bar-line">
                  <strong>{m.user_id === uid ? 'You' : memberName(m)}</strong>
                  <span className="mono small">
                    {m.progress.toLocaleString()} / {g.goal.toLocaleString()}
                    {pct >= 100 ? ' ✓' : ''}
                  </span>
                </div>
                <span className="progress-bar group-progress">
                  <i style={{ width: `${pct}%` }} />
                  {!ended && !notYet && <b className="group-pace" style={{ left: `${Math.round(passed * 100)}%` }} title="Where you'd be on an even pace" />}
                </span>
                {m.latest && <span className="muted small">Last finished: {m.latest}</span>}
              </div>
            </li>
          );
        })}
      </ol>
      {pending.length > 0 && <p className="muted small">Invited: {pending.map((m) => (m.user_id === uid ? 'you' : memberName(m))).join(', ')}</p>}
      {!ended && !notYet && <p className="muted small group-legend"><b className="group-pace-key" /> even pace to finish on time</p>}

      {!invited && (
        <div className="loan-actions">
          {!ended && notIn.length > 0 && <button className="link small" onClick={() => setInviting((x) => !x)}>Invite more</button>}
          {confirm ? (
            <>
              <button className="btn danger small-btn" disabled={busy} onClick={() => act(() => (g.owner === uid ? deleteGroup(g.id) : leaveGroup(g.id, uid)))}>
                {g.owner === uid ? 'Delete for everyone' : 'Leave'}
              </button>
              <button className="link small" onClick={() => setConfirm(false)}>Keep</button>
            </>
          ) : (
            <button className="link small" onClick={() => setConfirm(true)}>{g.owner === uid ? 'Delete challenge' : 'Leave challenge'}</button>
          )}
        </div>
      )}
      {inviting && (
        <div className="buddy-friends">
          {notIn.map((f) => (
            <button key={f.id} className="buddy-friend" disabled={busy} onClick={() => act(() => inviteToGroup(g.id, [f.id])).then(() => setInviting(false))}>
              <Avatar p={f} size={28} /> <span>Invite {f.display_name || `@${f.username}`}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="account-error small">{error}</p>}
    </article>
  );
}

export function GroupChallengesView(props: Readonly<Props>) {
  const { uid, groups, onChanged } = props;
  const [starting, setStarting] = useState(false);
  const byId = useMemo(() => new Map(props.books.map((b) => [b.id, b])), [props.books]);
  const hasFriends = props.friends.some((f) => f.status === 'accepted');
  const today = iso(new Date());
  const current = groups.filter((g) => g.end_on >= today);
  const past = groups.filter((g) => g.end_on < today);

  return (
    <div className="groups">
      {starting ? (
        <StartForm
          uid={uid}
          friends={props.friends}
          books={props.books}
          readings={props.readings}
          onCancel={() => setStarting(false)}
          onDone={() => {
            setStarting(false);
            onChanged();
          }}
        />
      ) : null}
      {!starting && hasFriends ? (
        <button className="btn primary group-new" onClick={() => setStarting(true)}>Start a challenge with friends</button>
      ) : null}
      {!starting && !hasFriends ? <div className="profile-missing">
          <p>Race your friends to a reading goal, like 24 books this year. Add a friend first.</p>
          <button className="btn primary" onClick={props.onFindFriends}>Find friends</button>
        </div> : null}
      {props.error && <p className="account-error">{props.error}</p>}
      {current.map((g) => (
        <Card key={g.id} g={g} uid={uid} friends={props.friends} onChanged={onChanged} onOpenProfile={props.onOpenProfile} onJoin={() => joinGroup(g.id, uid, myProgress(g, props.readings, byId))} />
      ))}
      {!current.length && !starting && hasFriends && !props.error && <p className="muted">No challenges with friends yet. Start one and see who reads the most.</p>}
      {past.length > 0 && (
        <>
          <h3 className="section-label">Finished</h3>
          {past.map((g) => (
            <Card key={g.id} g={g} uid={uid} friends={props.friends} onChanged={onChanged} onOpenProfile={props.onOpenProfile} onJoin={() => joinGroup(g.id, uid, myProgress(g, props.readings, byId))} />
          ))}
        </>
      )}
    </div>
  );
}

function daysUntilEnd(endOn: string): number {
  const end = Date.parse(`${endOn}T23:59:59`);
  return Math.ceil((end - Date.now()) / 86_400_000);
}
