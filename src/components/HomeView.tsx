import { useMemo, useState } from 'react';
import type { Book, Challenge, Reading, Spin } from '../types';
import { isMusic, kindOf } from '../types';
import { Cover } from './Cover';
import { NowReading } from './ReadingView';
import { FeedView } from './FeedView';
import { HomeRecs } from './RecsView';
import { daysLeft, dueLabel } from '../lib/lending';
import { progressOf } from '../lib/challenges';
import { currentReading, queueKey, todayIso } from '../lib/reading';
import { readingStreak, type ActiveSession } from '../lib/sessions';
import { agoLabel, nowSpinning, periodStarts, pickRecord, playsByRecord, spinStreak, spinsSince } from '../lib/spins';
import type { Profile } from '../lib/profile';
import { dateLabel, type Release } from '../lib/newreleases';

export type HomeTarget = 'buddy' | 'foryou' | 'lending' | 'groups' | 'library' | 'shelves' | 'wishlist' | 'music' | 'listening' | 'reading' | 'challenges' | 'friends' | 'newbooks' | 'newmusic' | 'clubs';

interface Props {
  allBooks: Book[];
  readings: Reading[];
  challenges: Challenge[];
  spins: Spin[];
  profile: Profile | null;
  uid?: string;
  active: ActiveSession | null;
  onOpen: (b: Book) => void;
  onSaveReading: (r: Reading) => void;
  onStartTimer: (r: Reading, b: Book) => void;
  onSpin: (b: Book) => void;
  onGo: (where: HomeTarget) => void;
  onOpenProfile: (username: string) => void;
  onSignIn: () => void;
  /** Buddy reads you're in, and invites waiting for you. */
  buddy?: { title: string; others: string; invite: boolean; myPct: number; leaderPct: number }[];
  /** Borrow requests waiting for you, things due back soon, and your overdue loans. */
  lending?: { asks: number; items: { title: string; line: string; due: string | null }[] };
  /** Running challenges with friends: your progress and place. */
  groups?: { name: string; goal: number; measure: string; mine: number; invite: boolean; place: number; of: number }[];
  /** New and upcoming books and albums from who you follow, and how many you haven't seen. */
  releases?: { books: Release[]; music: Release[]; unseen: Set<string> };
  /** Your book clubs: what they're reading and when they meet next. */
  clubs?: { name: string; book?: string; meet?: string; invite: boolean }[];
}

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  return h < 18 ? 'Good afternoon' : 'Good evening';
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

type Go = (where: HomeTarget) => void;

function HomeClubs({ clubs, onGo }: Readonly<{ clubs?: Props['clubs']; onGo: Go }>) {
  if (!clubs?.length) return null;
  return (
    <section className="panel">
      <div className="home-head">
        <h3>Book clubs</h3>
        <button className="link small" onClick={() => onGo('clubs')}>Open</button>
      </div>
      <ul className="home-buddy">
        {clubs.slice(0, 3).map((c) => (
          <li key={c.name}>
            <button className="link-plain" onClick={() => onGo('clubs')}>{c.name}</button>
            <span className="muted small">
              {c.invite ? 'You’re invited' : [c.book ? `Reading ${c.book}` : 'No book yet', c.meet && `meets ${c.meet}`].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HomeBuddy({ buddy, onGo }: Readonly<{ buddy?: Props['buddy']; onGo: Go }>) {
  if (!buddy?.length) return null;
  return (
    <section className="panel">
      <div className="home-head">
        <h3>Buddy reads</h3>
        <button className="link small" onClick={() => onGo('buddy')}>Open</button>
      </div>
      <ul className="home-buddy">
        {buddy.slice(0, 3).map((x) => (
          <li key={`${x.title}|${x.others}`}>
            <button className="link-plain" onClick={() => onGo('buddy')}>{x.title}</button>
            <span className="muted small">
              {x.invite ? `${x.others} invited you` : buddyLine(x)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HomeLending({ lending, onGo }: Readonly<{ lending?: Props['lending']; onGo: Go }>) {
  if (!lending || (lending.asks <= 0 && lending.items.length <= 0)) return null;
  return (
    <section className="panel">
      <div className="home-head">
        <h3>Lending</h3>
        <button className="link small" onClick={() => onGo('lending')}>Open</button>
      </div>
      {lending.asks > 0 && (
        <p className="home-lend-asks">
          <button className="link-plain" onClick={() => onGo('lending')}>
            {plural(lending.asks, 'friend wants', 'friends want')} to borrow something
          </button>
        </p>
      )}
      {lending.items.length > 0 && (
        <ul className="home-buddy">
          {lending.items.slice(0, 3).map((x) => (
            <li key={`${x.title}|${x.line}`}>
              <button className="link-plain" onClick={() => onGo('lending')}>{x.title}</button>
              <span className={`muted small ${(daysLeft(x.due) ?? 0) < 0 ? 'late-text' : ''}`}>{x.line} · {dueLabel(x.due)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Goal = { c: Challenge; p: ReturnType<typeof progressOf> };

function goalLine(c: Challenge, p: Goal['p']): string {
  if (p.pct >= 100) return 'Done. Nice work!';
  if (p.done >= p.expected) return `On track, ${p.daysLeft} days left`;
  return `${Math.ceil(p.expected - p.done).toLocaleString()} ${c.measure} behind · about ${Math.ceil(p.perWeekNeeded).toLocaleString()} a week to finish on time`;
}

function groupLine(g: NonNullable<Props['groups']>[number]): string {
  if (g.invite) return 'A friend invited you. ';
  return g.of > 1 ? `With friends · you're ${ordinal(g.place)} of ${g.of}` : 'With friends · waiting for them to join';
}

function HomeGoals({ goals, groups, onGo }: Readonly<{ goals: Goal[]; groups?: Props['groups']; onGo: Go }>) {
  return (
      <section className="panel">
        <div className="home-head">
          <h3>Reading goal</h3>
          <button className="link small" onClick={() => onGo('challenges')}>{goals.length ? 'All goals' : 'Set one'}</button>
        </div>
        {goals.length ? (
          goals.map(({ c, p }) => (
            <div key={c.id} className="home-goal">
              <div className="home-goal-line">
                <strong>{c.name}</strong>
                <span className="mono">
                  {p.done.toLocaleString()} / {c.goal.toLocaleString()} {c.measure}
                </span>
              </div>
              <span className="progress-bar">
                <i style={{ width: `${Math.min(100, p.pct)}%` }} />
              </span>
              <span className="muted small">
                {goalLine(c, p)}
              </span>
            </div>
          ))
        ) : (
          !groups?.length && <p className="muted">Give yourself something to aim for, like 24 books this year.</p>
        )}
        {groups?.slice(0, 3).map((g) => (
          <div key={g.name} className="home-goal">
            <div className="home-goal-line">
              <button className="link-plain" onClick={() => onGo('groups')}><strong>{g.name}</strong></button>
              <span className="mono">
                {g.mine.toLocaleString()} / {g.goal.toLocaleString()} {g.measure}
              </span>
            </div>
            <span className="progress-bar">
              <i style={{ width: `${Math.min(100, Math.round((g.mine / g.goal) * 100))}%` }} />
            </span>
            <span className="muted small">
              {groupLine(g)}
              {g.invite && <button className="link small" onClick={() => onGo('groups')}>Join or decline</button>}
            </span>
          </div>
        ))}
      </section>
  );
}

function HomeUpNext({ upNext, onGo, onOpen }: Readonly<{ upNext: { b: Book }[]; onGo: Go; onOpen: (b: Book) => void }>) {
  return (
      <section className="panel">
        <div className="home-head">
          <h3>Up next</h3>
          <button className="link small" onClick={() => onGo('reading')}>Your queue</button>
        </div>
        {upNext.length ? (
          <ol className="home-covers">
            {upNext.map(({ b }) => (
              <li key={b.id}>
                <button onClick={() => onOpen(b)} title={b.title}>
                  <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" />
                  <span className="home-cover-title">{b.title}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Mark books as “Want to read” and they line up here.</p>
        )}
      </section>
  );
}

interface MusicProps {
  spinning?: Book;
  pick?: Book;
  setPick: (b?: Book) => void;
  records: Book[];
  plays: ReturnType<typeof playsByRecord>;
  spinsWeek: number;
  listenStreak: number;
  onGo: Go;
  onOpen: (b: Book) => void;
  onSpin: (b: Book) => void;
}

function HomeMusic({ spinning, pick, setPick, records, plays, spinsWeek, listenStreak, onGo, onOpen, onSpin }: Readonly<MusicProps>) {
  const lastPlayed = pick && plays.get(pick.id)?.last;
  return (
      <section className="panel home-music">
        <div className="home-head">
          <h3>{spinning ? 'Spinning now' : 'Put something on'}</h3>
          <button className="link small" onClick={() => onGo('listening')}>Listening</button>
        </div>
        {spinning ? (
          <div className="home-record">
            <Cover url={spinning.coverUrl} title={spinning.title} author={spinning.authors[0]} size="sm" square />
            <span>
              <button className="link-plain" onClick={() => onOpen(spinning)}>{spinning.title}</button>
              <span className="muted small">{spinning.authors[0]} · play {plays.get(spinning.id)?.count ?? 1}</span>
            </span>
            <span className="vinyl-disc small-disc" aria-hidden="true" />
          </div>
        ) : null}
        {!spinning && pick ? (
          <div className="home-record">
            <Cover url={pick.coverUrl} title={pick.title} author={pick.authors[0]} size="sm" square />
            <span>
              <button className="link-plain" onClick={() => onOpen(pick)}>{pick.title}</button>
              <span className="muted small">
                {pick.authors[0]} · {lastPlayed ? `last played ${agoLabel(lastPlayed)}` : 'never played'}
              </span>
            </span>
            <span className="home-record-actions">
              <button className="btn primary small-btn" onClick={() => onSpin(pick)}>▶ Spin</button>
              <button className="link small" onClick={() => setPick(pickRecord(records, plays, pick.id))}>Another</button>
            </span>
          </div>
        ) : null}
        {!spinning && !pick ? <p className="muted">Scan your records and CDs and Stacks suggests one to put on.</p> : null}
        {(spinsWeek > 0 || listenStreak > 0) && (
          <p className="muted small">
            {plural(spinsWeek, 'spin')} this week{listenStreak > 1 ? ` · ${listenStreak} days in a row with music` : ''}
          </p>
        )}
      </section>
  );
}

function HomeReleases({ releases, onGo }: Readonly<{ releases?: Props['releases']; onGo: Go }>) {
  if (!releases || releases.books.length + releases.music.length <= 0) return null;
  const { books: nb, music: nm, unseen } = releases;
  // Unseen first, then what's out soonest or most recently.
  const order = (l: Release[]) => [...l].sort((a, b) => Number(unseen.has(b.key)) - Number(unseen.has(a.key)) || Number(b.upcoming) - Number(a.upcoming));
  const list = [...order(nb).slice(0, 3), ...order(nm).slice(0, 3)].sort((a, b) => Number(unseen.has(b.key)) - Number(unseen.has(a.key))).slice(0, 4);
  const fresh = [...nb, ...nm].filter((r) => unseen.has(r.key)).length;
  return (
    <section className="panel">
      <div className="home-head">
        <h3>New releases{fresh > 0 && <span className="tab-badge">{fresh} new</span>}</h3>
        <span className="home-head-links">
          {nb.length > 0 && <button className="link small" onClick={() => onGo('newbooks')}>Books</button>}
          {nm.length > 0 && <button className="link small" onClick={() => onGo('newmusic')}>Music</button>}
        </span>
      </div>
      <ul className="home-buddy home-releases">
        {list.map((r) => (
          <li key={r.key}>
            <Cover url={r.cover} title={r.title} author={r.authors[0]} size="sm" square={r.kind === 'music'} />
            <span>
              <button className="link-plain" onClick={() => onGo(r.kind === 'music' ? 'newmusic' : 'newbooks')}>{r.title}</button>
              <span className="muted small">{r.authors[0]} · {dateLabel(r.date)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HomeRecent({ recent, unshelved, wished, onGo, onOpen }: Readonly<{ recent: Book[]; unshelved: number; wished: number; onGo: Go; onOpen: (b: Book) => void }>) {
  return (
      <section className="panel">
        <div className="home-head">
          <h3>Recently added</h3>
          <button className="link small" onClick={() => onGo('library')}>Library</button>
        </div>
        {recent.length ? (
          <ol className="home-covers home-covers-8">
            {recent.map((b) => (
              <li key={b.id}>
                <button onClick={() => onOpen(b)} title={[b.title, b.authors[0]].filter(Boolean).join(' · ')}>
                  <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" square={kindOf(b) !== 'book'} />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Scan a barcode to add your first book or record.</p>
        )}
        {(unshelved > 0 || wished > 0) && (
          <p className="home-nudges">
            {unshelved > 0 && (
              <button className="link small" onClick={() => onGo('shelves')}>
                {plural(unshelved, 'book')} not on a shelf yet
              </button>
            )}
            {wished > 0 && (
              <button className="link small" onClick={() => onGo('wishlist')}>
                {plural(wished, 'book')} on your wishlist
              </button>
            )}
          </p>
        )}
      </section>
  );
}

function HomeFriends({ uid, profile, onGo, onOpenProfile, onSignIn }: Readonly<{ uid?: string; profile: Profile | null; onGo: Go; onOpenProfile: (u: string) => void; onSignIn: () => void }>) {
  const social = !!(uid && profile);
  return (
      <section className="panel home-feed">
        <div className="home-head">
          <h3>Friends</h3>
          {social && <button className="link small" onClick={() => onGo('friends')}>All</button>}
        </div>
        {social && uid ? (
          <FeedView uid={uid} onOpenProfile={onOpenProfile} hasFriends onFindFriends={() => onGo('friends')} limit={4} />
        ) : null}
        {!social && uid ? (
          <p className="muted">Make your profile to add friends and see what they're reading. <button className="link small" onClick={() => onGo('friends')}>Set it up</button></p>
        ) : null}
        {!social && !uid ? <p className="muted">
            <button className="link small" onClick={onSignIn}>Sign in</button> to keep your library on all your devices and see what your friends are reading.
          </p> : null}
      </section>
  );
}

export function HomeView(props: Readonly<Props>) {
  const { allBooks, readings, challenges, spins, profile, uid, onOpen, onGo, onSpin } = props;
  const owned = useMemo(() => allBooks.filter((b) => b.owned !== false), [allBooks]);
  const byId = useMemo(() => new Map(allBooks.map((b) => [b.id, b])), [allBooks]);
  const year = new Date().getFullYear();
  const today = todayIso();

  const readThisYear = readings.filter((r) => r.status === 'read' && r.finishedOn?.startsWith(String(year)));
  const pagesThisYear = readThisYear.reduce((n, r) => n + (byId.get(r.bookId)?.pageCount ?? 0), 0);
  const streak = readingStreak(readings);
  const books = owned.filter((b) => !isMusic(b));
  const records = owned.filter(isMusic);
  const starts = periodStarts();
  const spinsWeek = spinsSince(spins, starts.week);
  const plays = useMemo(() => playsByRecord(spins), [spins]);
  const listenStreak = spinStreak(spins);

  // Goals that are running now.
  const goals = challenges
    .filter((c) => c.startOn <= today && c.endOn >= today)
    .map((c) => ({ c, p: progressOf(c, readings, byId) }))
    .slice(0, 2);

  // The top of your to-read queue.
  const upNext = allBooks
    .filter((b) => !isMusic(b))
    .map((b) => ({ b, r: currentReading(readings, b.id) }))
    .filter((x): x is { b: Book; r: Reading } => x.r?.status === 'want')
    .sort((x, y) => queueKey(x.r) - queueKey(y.r))
    .slice(0, 4);

  const now = nowSpinning(spins);
  const spinning = now && byId.get(now.bookId);
  const [pick, setPick] = useState<Book | undefined>(() => pickRecord(records, plays));

  const recent = [...owned].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 8);
  const unshelved = books.filter((b) => !b.placement).length;
  const wished = allBooks.filter((b) => b.wishlist && b.owned === false).length;

  const name = profile?.display_name || (profile ? `@${profile.username}` : '');
  const summary = [
    readThisYear.length ? `${plural(readThisYear.length, 'book')} read in ${year}` : '',
    streak > 1 ? `${streak}-day reading streak` : '',
    spinsWeek ? `${plural(spinsWeek, 'spin')} this week` : '',
  ].filter(Boolean);

  return (
    <section className="home" aria-label="Home">
      <header className="home-hello">
        <p className="home-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h2>
          {greeting()}
          {name ? `, ${name}` : ''}.
        </h2>
        {summary.length > 0 && <p className="muted">{summary.join(' · ')}</p>}
      </header>

      <dl className="home-stats">
        <button onClick={() => onGo('library')}>
          <dt>Books</dt>
          <dd>{books.length.toLocaleString()}</dd>
        </button>
        <button onClick={() => onGo('music')}>
          <dt>Records and CDs</dt>
          <dd>{records.length.toLocaleString()}</dd>
        </button>
        <button onClick={() => onGo('reading')}>
          <dt>Read in {year}</dt>
          <dd>{readThisYear.length.toLocaleString()}</dd>
        </button>
        <button onClick={() => onGo('reading')}>
          <dt>Pages in {year}</dt>
          <dd>{pagesThisYear.toLocaleString()}</dd>
        </button>
      </dl>

      <div className="home-grid">
        <div className="home-col">
          <NowReading
            books={allBooks}
            readings={readings}
            onOpen={onOpen}
            onChange={props.onSaveReading}
            active={props.active}
            onStartTimer={props.onStartTimer}
          />

          <HomeClubs clubs={props.clubs} onGo={onGo} />

          <HomeBuddy buddy={props.buddy} onGo={onGo} />

          <HomeLending lending={props.lending} onGo={onGo} />

          <HomeGoals goals={goals} groups={props.groups} onGo={onGo} />

          <HomeUpNext upNext={upNext} onGo={onGo} onOpen={onOpen} />

          <HomeRecs books={allBooks} readings={readings} uid={uid} social={!!(uid && profile)} onOpen={onOpen} onAll={() => onGo('foryou')} />
        </div>

        <div className="home-col">
          <HomeMusic spinning={spinning} pick={pick} setPick={setPick} records={records} plays={plays} spinsWeek={spinsWeek} listenStreak={listenStreak} onGo={onGo} onOpen={onOpen} onSpin={onSpin} />

          <HomeReleases releases={props.releases} onGo={onGo} />

          <HomeRecent recent={recent} unshelved={unshelved} wished={wished} onGo={onGo} onOpen={onOpen} />

          <HomeFriends uid={uid} profile={profile} onGo={onGo} onOpenProfile={props.onOpenProfile} onSignIn={props.onSignIn} />
        </div>
      </div>
    </section>
  );
}

function buddyLine(x: { others: string; myPct: number; leaderPct: number }): string {
  const ahead = x.leaderPct > x.myPct ? `, ahead is ${x.leaderPct}%` : '';
  return `with ${x.others} · you ${x.myPct}%${ahead}`;
}
